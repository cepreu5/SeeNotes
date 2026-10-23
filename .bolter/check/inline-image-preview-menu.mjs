// Менюто на вградената снимка в режим ПРЕГЛЕД (четене) - план 10, cx-notes.
// Собственикът (23.10.2026): „да покажем това меню и в режим Преглед при клик на снимката и при
// промяна да записваме при затваряне на модала".
// Проверява се точно това, по истинския път на приложението:
//   - в режим четене щрак върху рамката на снимката отваря менюто (плъзгач + „Обнови");
//   - в това меню НЯМА „Преглед", НЯМА „Махни", НЯМА „Сложи в текста";
//   - плъзгането сменя ширината ВЕДНАГА на екрана (пикселите растат, data-nm-pct се сменя);
//   - записът става при ЗАТВАРЯНЕ на модала: бележката в IndexedDB носи новия paramint;
//   - затваряне с X и затваряне с Escape - и двата записват (flush-ът е на затварянето);
//   - след повторно отваряне снимката е с новата ширина (записът наистина се чете);
//   - кликът за отметки [ ]/[x] в текста остава както е - менюто не го пипа.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-preview-menu.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const SHOTS = process.env.SHOTS || '';

// --- Фалшив Drive: папка Images с ЕДНА малка снимка (300px), за да се вижда разликата в ширината ---
const DRIVE = { list: [], thumb: [] };
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const WIDE = 300; // естествената ширина на file_0000.png в този тест

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    DRIVE.thumb.push(fileId);
    if (fileId !== SMALL_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
  }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    DRIVE.list.push(q);
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
    if (name === 'multinotes_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: DATA_FOLDER, name: 'multinotes_data' }] }) });
    if (name === SMALL) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: SMALL_ID, name: SMALL, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDE}" height="225"><rect width="${WIDE}" height="225" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list() { return Promise.resolve({ result: { files: [] } }); },
          get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
  // Източникът на записа в тази проверка е IndexedDB (папка Drive не се пипа - вж. writeNoteToSources).
  localStorage.setItem('useIndexedDb', 'true');
  localStorage.removeItem('updateLocalFolder');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
await page.waitForFunction(() => typeof bulkPutDB === 'function' && typeof getFormattedNoteHtml === 'function');

// --- Точното изречение на собственика: снимката е на мястото на първата звездичка ---
const SENTENCE = 'Може да добавите всяка бележка на * началния екран * като widget';
const STAR1 = SENTENCE.indexOf('*');
const IMG_PATH = '/storage/emulated/0/Pictures/Images/' + SMALL;
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const SPAN = span8(STAR1, STAR1 + 1, IMG_PATH, 3); // 30%
const RAW = 'Преглед|' + SENTENCE;
const GDID = 'G_VIEW';
const NID = 'view-1';
const FORMAT = fmt(SPAN);

// --- Бележката се отваря в режим ЧЕТЕНЕ (без редактор) през истинския showModal ---
const openNote = (note) => page.evaluate(async ({ raw, format, gdid, id, attach }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = true;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  if (!mediaData.some(m => m.noteid === gdid)) mediaData.push(...attach.map(a => ({ ...a, noteid: gdid })));
  const existing = allNotesData.find(n => String(n.gdid) === String(gdid));
  if (existing) {
    existing.notetxt = raw;
    existing.text_span = format;
  } else {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid, id, notetxt: raw, numord: 901, sellist: 0, status: 0, text_span: format,
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 244,
    });
  }
  showModal({ raw, format, gdid, id });
  const body = document.getElementById('modal-body');
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  // Кадърът се тегли по мрежата: изчаква се да е готов (иначе ширината още е проценти).
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const b = body.querySelector('.nm-inline-img[data-nm-view="note"]');
    if (b && b.dataset.nmState === 'ready' && b.querySelector('img')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  // Прозорецът се отваря със смаляване (scale 0.7 -> 1): геометрията се мери само на мащаб 1.
  while (Date.now() < deadline) {
    const scale = box.getBoundingClientRect().width / (box.offsetWidth || 1);
    if (Math.abs(scale - 1) < 0.002) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  await new Promise(r => setTimeout(r, 60));
  return true;
}, { raw: note.raw, format: note.format, gdid: note.gdid, id: note.id, attach: [{ datemod: 1, description: '', gdid: 'M1', id: 1, path: SMALL, pathGD: SMALL_ID, type: 1 }] });

const frameState = () => page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const b = body && body.querySelector('.nm-inline-img[data-nm-view="note"]');
  if (!b) return { missing: true, hasEditor: !!document.getElementById('note-edit-textarea') };
  const r = b.getBoundingClientRect();
  const menu = document.querySelector('.nm-inline-menu');
  const mr = menu ? menu.getBoundingClientRect() : null;
  const cs = getComputedStyle(body);
  return {
    px: Math.round(r.width),
    style: b.style.width,
    pct: b.dataset.nmPct || null,
    natural: b.dataset.nmNatural || null,
    base: b.dataset.nmBase || null,
    state: b.dataset.nmState,
    cx: Math.round(r.left + r.width / 2),
    cy: Math.round(r.top + r.height / 2),
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    column: Math.round(body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
    hasEditor: !!document.getElementById('note-edit-textarea'),
    menu: menu ? {
      kind: menu.dataset.nmMenu,
      actions: [...menu.querySelectorAll('[data-nm-menu-action]')].map(x => x.dataset.nmMenuAction),
      labels: [...menu.querySelectorAll('.nm-inline-menu-row')].map(x => x.textContent.trim()),
      values: [...menu.querySelectorAll('[data-nm-menu-value]')].map(x => x.textContent.trim()),
      range: menu.querySelector('.nm-inline-menu-range') ? menu.querySelector('.nm-inline-menu-range').value : null,
      rect: mr ? { left: Math.round(mr.left), top: Math.round(mr.top), right: Math.round(mr.right), bottom: Math.round(mr.bottom), width: Math.round(mr.width) } : null,
    } : null,
    menus: document.querySelectorAll('.nm-inline-menu').length,
  };
});

// Прочита на бележката ОТ ИЗТОЧНИКА (IndexedDB) - както го прави приложението при старт.
const noteInDb = () => page.evaluate(async ({ gdid }) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('NotesDB'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const rows = await new Promise(res => { const tx = db.transaction(['notes'], 'readonly'); const rq = tx.objectStore('notes').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); });
  db.close();
  const hit = rows.find(r => String(r.gdid) === String(gdid));
  if (!hit) return { missing: true, rows: rows.length };
  const spans = String(hit.text_span || '').split('|').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  return {
    paramints: spans.filter(s => s.type === 8).map(s => s.paramint),
    names: spans.filter(s => s.type === 8).map(s => String(s.paramstring || '').split('/').pop()),
    version: hit.version, datemod: hit.datemod, textSpan: hit.text_span,
  };
}, { gdid: GDID });

const waitDbParamint = async (want, ms = 8000) => {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async ({ gdid }) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('NotesDB'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const rows = await new Promise(res => { const tx = db.transaction(['notes'], 'readonly'); const rq = tx.objectStore('notes').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); });
      db.close();
      const hit = rows.find(r => String(r.gdid) === String(gdid));
      if (!hit) return null;
      const spans = String(hit.text_span || '').split('|').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
      return { paramints: spans.filter(s => s.type === 8).map(s => s.paramint), version: hit.version };
    }, { gdid: GDID });
    if (last && last.paramints.includes(want)) return last;
    await new Promise(r => setTimeout(r, 100));
  }
  return last;
};

// ======================= 1. Бележката се отваря в режим четене =======================
await openNote({ raw: RAW, format: FORMAT, gdid: GDID, id: NID });
let s = await frameState();
ok(!s.missing, 'бележката има вградена снимка в режим четене', s);
ok(s.hasEditor === false, 'модалът е в режим Преглед (няма #note-edit-textarea)', s);
ok(s.state === 'ready' && s.px > 0, `снимката е заредена и има ширина (${s.px}px, ${s.style})`, s);
ok(s.pct === '30', `записът е 30% и рамката го показва (${s.pct})`, s);
ok(s.natural === String(WIDE) && Math.abs(s.px - Math.round(WIDE * 30 / 100)) <= 2,
  `30% от естествената ширина ${WIDE}px = ${Math.round(WIDE * 0.3)}px (${s.px}px)`, s);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-1-read.png` });

// ======================= 2. Щрак върху снимката отваря менюто =======================
await page.mouse.click(s.cx, s.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
s = await frameState();
ok(s.menu && s.menu.kind === 'preview', `щрак върху снимката в режим Преглед отваря менюто (${s.menu && s.menu.kind})`, s.menu);
ok(s.menus === 1, `отворило се е едно меню (${s.menus})`);
ok(s.menu && s.menu.actions.join(',') === 'update,cancel',
  `в това меню има само „Обнови" и „Отказ" (${s.menu && s.menu.actions})`, s.menu && s.menu.labels);
ok(s.menu && s.menu.labels.join('|') === 'Обнови|Отказ', `редовете са „Обнови" и „Отказ" на български (${s.menu && s.menu.labels})`);
ok(s.menu && !['preview', 'remove', 'insert'].some(a => s.menu.actions.includes(a)),
  `няма „Преглед", „Махни" и „Сложи в текста" (${s.menu && s.menu.actions})`);
ok(s.menu && s.menu.range === '30' && s.menu.values.join('|') === '30%|30%',
  `плъзгачът отваря на сегашната ширина (${s.menu && s.menu.range}, ${s.menu && s.menu.values})`, s.menu);
ok(s.menu && s.menu.rect && !(s.menu.rect.top <= s.bottom && s.menu.rect.bottom >= s.top && s.menu.rect.left <= s.right && s.menu.rect.right >= s.left),
  `менюто излиза до снимката, без да я закрива (меню ${s.menu && JSON.stringify(s.menu.rect)}, снимка ${s.left},${s.top}..${s.right},${s.bottom})`, { menu: s.menu, frame: s });
ok(s.menu && s.menu.rect && s.menu.rect.left >= 0 && s.menu.rect.right <= 1281,
  `менюто не излиза извън екрана (${s.menu && s.menu.rect && s.menu.rect.left}..${s.menu && s.menu.rect && s.menu.rect.right})`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-2-menu.png` });

// Без меню останалите проверки няма как да минат (например на дървото без тази промяна щракът
// отваря редактора) - проверката свършва тук с ясен провал, вместо да падне по средата.
if (!s.menu) {
  ok(false, 'менюто в режим Преглед не се отвори с щрак върху снимката');
  await browser.close(); srv.close();
  console.log(`\n${n - fails}/${n} проверки минават`);
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}

// ======================= 3. Плъзгането сменя ширината ВЕДНАГА =======================
const before = s.px;
const slid = await page.evaluate(async () => {
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  const read = () => {
    const b = document.getElementById('modal-body').querySelector('.nm-inline-img[data-nm-view="note"]');
    return { px: Math.round(b.getBoundingClientRect().width), style: b.style.width, pct: b.dataset.nmPct, shown: (document.querySelector('.nm-inline-menu [data-nm-menu-value]') || {}).textContent };
  };
  range.value = '70';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const at70 = read();
  range.value = '50';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const at50 = read();
  range.value = '70';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { at70, at50, at70again: read(), menuOpen: !!document.querySelector('.nm-inline-menu') };
});
ok(slid.at70.pct === '70' && slid.at70.shown === '70%',
  `70% е избрано и се вижда в менюто (${slid.at70.pct}, ${slid.at70.shown})`, slid.at70);
ok(slid.at70.px > before && slid.at70.px === Math.round(WIDE * 70 / 100),
  `при 70% снимката расте ВЕДНАГА, преди да е затворен модалът (${before}px -> ${slid.at70.px}px, style ${slid.at70.style})`, { slid, before });
ok(slid.at50.px < slid.at70.px && slid.at50.pct === '50',
  `и се свива, ако плъзгачът се върне назад (${slid.at70.px}px -> ${slid.at50.px}px)`, slid);
ok(slid.at70again.px === slid.at70.px, `70% пак дава същата ширина (${slid.at70again.px}px)`);
ok(slid.menuOpen === true, 'менюто остава отворено, докато се плъзга');
if (SHOTS) await page.screenshot({ path: `${SHOTS}-3-slid.png` });

// ======================= 4. „Обнови" затваря менюто =======================
const updated = await page.evaluate(async () => {
  document.querySelector('.nm-inline-menu [data-nm-menu-action="update"]').click();
  await new Promise(r => setTimeout(r, 40));
  const b = document.getElementById('modal-body').querySelector('.nm-inline-img[data-nm-view="note"]');
  return { menu: !!document.querySelector('.nm-inline-menu'), px: Math.round(b.getBoundingClientRect().width), pct: b.dataset.nmPct };
});
ok(updated.menu === false, '„Обнови" затваря менюто');
ok(updated.pct === '70' && updated.px === Math.round(WIDE * 70 / 100),
  `и ширината остава 70% (${updated.px}px)`, updated);

// ======================= 5. Записът става при ЗАТВАРЯНЕ (X) =======================
const beforeClose = await noteInDb();
const closedByX = await page.evaluate(async () => {
  const win = (typeof activeNoteWindow !== 'undefined' && activeNoteWindow) ? activeNoteWindow : null;
  const el = win ? win.el : document.getElementById('content-modal');
  const btn = el.querySelector('.modal-close');
  const had = !!btn;
  if (btn) btn.click(); else el.classList.remove('visible');
  // Изчаква се затварянето (то минава през checkUnsavedChanges) - 'visible' пада.
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const stillOpen = win ? win.open : el.classList.contains('visible');
    if (!stillOpen) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return { had, stillOpen: win ? win.open : el.classList.contains('visible') };
});
ok(closedByX.had && closedByX.stillOpen === false, 'модалът се затваря с X (истинският бутон)', closedByX);
const afterX = await waitDbParamint(7);
ok(afterX && afterX.paramints.includes(7),
  `при затваряне на модала бележката В ИЗТОЧНИКА (IndexedDB) носи paramint 7 (${JSON.stringify(afterX && afterX.paramints)})`, { beforeClose, afterX });
ok(afterX && afterX.version > (beforeClose.version || 0),
  `записът е вдигнал version (${beforeClose && beforeClose.version} -> ${afterX && afterX.version})`, { beforeClose, afterX });

// ======================= 6. Повторно отваряне: снимката е с новата ширина =======================
const db7 = await noteInDb();
await openNote({ raw: RAW, format: db7.textSpan, gdid: GDID, id: NID });
s = await frameState();
ok(Math.abs(s.px - Math.round(WIDE * 70 / 100)) <= 2 && s.pct === '70',
  `след повторно отваряне снимката е с новата ширина (${s.px}px, ${s.pct}%)`, s);
ok(s.hasEditor === false, 'пак сме в режим четене');

// ======================= 7. Затваряне с Escape също записва =======================
await page.mouse.click(s.cx, s.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const escSlid = await page.evaluate(async () => {
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '100';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const b = document.getElementById('modal-body').querySelector('.nm-inline-img[data-nm-view="note"]');
  return { px: Math.round(b.getBoundingClientRect().width), pct: b.dataset.nmPct };
});
ok(escSlid.pct === '100' && escSlid.px === WIDE, `плъзгачът стига 100% (${escSlid.px}px)`, escSlid);
// Първият Escape затваря МЕНЮТО (то има свой слушател и спира събитието), вторият - модала.
// Точно това прави и потребителят.
const escSteps = await page.evaluate(async () => {
  const key = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  const menuOpen = () => !!document.querySelector('.nm-inline-menu');
  const win = (typeof activeNoteWindow !== 'undefined' && activeNoteWindow) ? activeNoteWindow : null;
  const open = () => (win ? win.open : document.getElementById('content-modal').classList.contains('visible'));
  const first = menuOpen();
  key();
  await new Promise(r => setTimeout(r, 60));
  const afterMenu = menuOpen();
  key();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { if (!open()) break; await new Promise(r => setTimeout(r, 50)); }
  return { first, afterMenu, open: open() };
});
ok(escSteps.first === true && escSteps.afterMenu === false, 'първият Escape затваря менюто', escSteps);
ok(escSteps.open === false, 'и вторият затваря модала (истинският път на Escape)', escSteps);
const afterEsc = await waitDbParamint(10);
ok(afterEsc && afterEsc.paramints.includes(10),
  `и там записът минава: paramint 10 в източника (${JSON.stringify(afterEsc && afterEsc.paramints)})`, afterEsc);
ok(afterEsc && afterEsc.version > (afterX.version || 0),
  `version пак е вдигнат (${afterX && afterX.version} -> ${afterEsc && afterEsc.version})`, { afterX, afterEsc });

// ======================= 8. Кликът за отметки не се пипа =======================
// Менюто прихваща щрака на window в capture фаза, а отметката [ ]/[x] има свой слушател там.
// Бележка с отметка и снимка: отметката се обръща дори когато менюто е отворено.
const CB_PREFIX = '[ ] ';
const CB_RAW = 'Отметка|' + CB_PREFIX + SENTENCE;
const CB_SPAN = span8(STAR1 + CB_PREFIX.length, STAR1 + CB_PREFIX.length + 1, IMG_PATH, 3);
await openNote({ raw: CB_RAW, format: fmt(CB_SPAN), gdid: 'G_CB', id: 'cb-1' });
const cbFrame = await frameState();
ok(!cbFrame.missing, 'втората бележка (с отметка) също показва снимката си', cbFrame);
await page.mouse.click(cbFrame.cx, cbFrame.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const cbOpen = await frameState();
ok(cbOpen.menu && cbOpen.menu.kind === 'preview', 'менюто се отваря и в нея', cbOpen.menu);
const cbState = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const hit = body.querySelector('.nmd-cb-hit');
  if (!hit) return { missing: true };
  const before = hit.querySelector('input.nmd-cb').hasAttribute('checked');
  const rawBefore = String(currentModalContent || '');
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  // Записът е по мрежата/IndexedDB и след него модалът се рисува наново (input-ът е нов възел).
  const deadline = Date.now() + 5000;
  let raw = rawBefore;
  while (Date.now() < deadline) {
    raw = String(currentModalContent || '');
    if (/\[[xX]\].*началния/.test(raw) || raw !== rawBefore) break;
    await new Promise(r => setTimeout(r, 60));
  }
  const fresh = document.getElementById('modal-body').querySelector('input.nmd-cb');
  return {
    before,
    after: fresh ? fresh.hasAttribute('checked') : null,
    rawBefore: rawBefore.slice(0, 12),
    raw: raw.slice(0, 12),
    toggledInText: /\[[xX]\]/.test(raw),
    menu: !!document.querySelector('.nm-inline-menu'),
  };
});
ok(cbState.missing !== true && cbState.after === true && cbState.toggledInText,
  `кликът върху отметка в текста работи както досега, [ ] -> [x] (${JSON.stringify(cbState)})`, cbState);

// ======================= 9. Режим Преглед (окото) - снимката отваря менюто си =======================
// Собственикът: „Режим Преглед: клик на снимката в текста все още я отваря, а не отваря менюто за
// промяна". Минава се по истинския път: редакция -> окото („Преглед") -> щрак върху снимката.
// Тук ширината се пише в ЧЕРНОВАТА (previewDraftFormat + format) и оцелява записа.
const DRAFT_GDID = 'G_DRAFT';
const DRAFT_ID = 'draft-1';
const DRAFT_RAW = 'Чернова|' + SENTENCE;
const DRAFT_ATTACH = [{ datemod: 1, description: '', gdid: 'MD1', id: 31, path: SMALL, pathGD: SMALL_ID, type: 1 }];

// Прочита на един запис ОТ ИЗТОЧНИКА (IndexedDB) по неговия ключ.
const dbSpansFor = (gdid) => page.evaluate(async ({ gdid }) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('NotesDB'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const rows = await new Promise(res => { const tx = db.transaction(['notes'], 'readonly'); const rq = tx.objectStore('notes').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); });
  db.close();
  const hit = rows.find(r => String(r.gdid) === String(gdid));
  if (!hit) return { missing: true, rows: rows.length };
  const spans = String(hit.text_span || '').split('|').filter(Boolean).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  return {
    paramints: spans.filter(s => s.type === 8).map(s => s.paramint),
    names: spans.filter(s => s.type === 8).map(s => String(s.paramstring || '').split('/').pop()),
    version: hit.version, textSpan: hit.text_span, notetxt: hit.notetxt,
  };
}, { gdid });

// Чака се записаният paramint в източника (записът върви във фонов режим).
const waitDbParamintFor = async (gdid, want, ms = 8000) => {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    last = await dbSpansFor(gdid);
    if (last && last.paramints && last.paramints.includes(want)) return last;
    await new Promise(r => setTimeout(r, 100));
  }
  return last;
};

const draftOpened = await page.evaluate(async ({ raw, format, gdid, id, attach }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = true;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  if (!mediaData.some(m => m.noteid === gdid)) mediaData.push(...attach.map(a => ({ ...a, noteid: gdid })));
  if (!allNotesData.some(n => String(n.gdid) === String(gdid))) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid, id, notetxt: raw, numord: 905, sellist: 0, status: 0, text_span: format,
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 40,
    });
  }
  showModal({ raw, format, gdid, id });
  const before = document.getElementById('modal-body');
  const beforeBox = before.closest('.modal-content-box');
  beforeBox.style.height = '660px';
  beforeBox.style.maxHeight = '660px';
  enableNoteEditing(before);
  const editorBody = document.getElementById('modal-body');
  const editorImages = (editorBody.dataset.format || '').split('|').filter(Boolean).length;
  // Окото: истинският бутон „Преглед" в редактора.
  const eye = document.getElementById('note-preview-btn');
  const hadEye = !!eye;
  eye.click();
  const preview = document.getElementById('modal-body');
  const box = preview.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const b = preview.querySelector('.nm-inline-img[data-nm-view="note"]');
    if (b && b.dataset.nmState === 'ready' && b.querySelector('img')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  // Прозорецът се отваря със смаляване (scale 0.7 -> 1): геометрията се мери само на мащаб 1.
  while (Date.now() < deadline) {
    const scale = box.getBoundingClientRect().width / (box.offsetWidth || 1);
    if (Math.abs(scale - 1) < 0.002) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  await new Promise(r => setTimeout(r, 60));
  const frame = preview.querySelector('.nm-inline-img[data-nm-view="note"]');
  const r = frame.getBoundingClientRect();
  return {
    hadEye,
    editorImages,
    isPreview: preview.dataset.isPreview,
    hasDraft: preview.dataset.draftText !== undefined,
    hasEditor: !!preview.querySelector('textarea'),
    previewDraftFormat: preview.dataset.previewDraftFormat,
    renderedFormat: preview.dataset.format,
    frame: { px: Math.round(r.width), pct: frame.dataset.nmPct, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) },
    windows: (typeof noteWindows !== 'undefined' ? noteWindows.filter(w => w.open).length : null),
  };
}, { raw: DRAFT_RAW, format: FORMAT, gdid: DRAFT_GDID, id: DRAFT_ID, attach: DRAFT_ATTACH });
ok(draftOpened.isPreview === 'true' && draftOpened.hasDraft && draftOpened.hasEditor === false,
  `окото води в Режим Преглед на ЧЕРНОВАТА: isPreview, draftText и без текстова кутия (${JSON.stringify({ isPreview: draftOpened.isPreview, hasDraft: draftOpened.hasDraft, hasEditor: draftOpened.hasEditor })})`, draftOpened);
ok(draftOpened.frame.px === Math.round(WIDE * 30 / 100) && draftOpened.frame.pct === '30',
  `снимката в прегледа е на 30% (${draftOpened.frame.px}px)`, draftOpened);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-4-draft-preview.png` });

// Щрак върху снимката: отваря се менюто, а НЕ файлът.
await page.mouse.click(draftOpened.frame.cx, draftOpened.frame.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const draftClick = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  const menu = document.querySelector('.nm-inline-menu');
  const overlay = document.querySelector('.image-preview-overlay');
  const r = frame ? frame.getBoundingClientRect() : null;
  return {
    menu: menu ? menu.dataset.nmMenu : null,
    labels: menu ? [...menu.querySelectorAll('.nm-inline-menu-row')].map(b => b.textContent.trim()) : null,
    actions: menu ? [...menu.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction) : null,
    range: menu ? menu.querySelector('.nm-inline-menu-range').value : null,
    values: menu ? [...menu.querySelectorAll('[data-nm-menu-value]')].map(v => v.textContent.trim()) : null,
    overlay: overlay ? (overlay.querySelector('img') || {}).src || true : null,
    px: r ? Math.round(r.width) : null,
    isPreview: body.dataset.isPreview,
    stillPreview: !!body.querySelector('.nm-inline-img[data-nm-view="note"]'),
    menus: document.querySelectorAll('.nm-inline-menu').length,
    // Форматите от мига на отварянето - с тях се сравнява каквото върне „Отказ".
    draftFormatOpen: body.dataset.previewDraftFormat,
    renderedFormatOpen: body.dataset.format,
  };
});
ok(draftClick.menu === 'preview' && draftClick.menus === 1,
  `щрак върху снимката в Режим Преглед отваря МЕНЮТО, не файла (меню ${draftClick.menu})`, draftClick);
ok(!draftClick.overlay && draftClick.stillPreview,
  `файлът не се отваря - няма преглед на файла, снимката си стои в бележката (${JSON.stringify(draftClick.overlay)})`, draftClick);
ok(draftClick.actions && draftClick.actions.join(',') === 'update,cancel',
  `менюто е само с „Обнови" и „Отказ" (${draftClick.actions})`, draftClick);
ok(draftClick.labels && draftClick.labels.join('|') === 'Обнови|Отказ',
  `редовете са с думите от i18n (${draftClick.labels})`, draftClick);
ok(draftClick.range === '30' && draftClick.values.join('|') === '30%|30%',
  `плъзгачът отваря на сегашната ширина (${draftClick.values})`, draftClick);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-5-draft-menu.png` });

// Второ щракване върху СЪЩАТА снимка затваря менюто (същият ход като при маркера в текста).
await page.mouse.click(draftOpened.frame.cx, draftOpened.frame.cy);
await page.waitForFunction(() => !document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const draftToggle = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  return { menu: !!document.querySelector('.nm-inline-menu'), frame: !!frame, px: frame ? Math.round(frame.getBoundingClientRect().width) : null };
});
ok(draftToggle.menu === false && draftToggle.frame === true && draftToggle.px === Math.round(WIDE * 30 / 100),
  `второ щракване върху същата снимка затваря менюто, а снимката си стои (${draftToggle.px}px)`, draftToggle);
await page.mouse.click(draftOpened.frame.cx, draftOpened.frame.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const reopened = await page.evaluate(() => {
  const menu = document.querySelector('.nm-inline-menu');
  return { menu: menu ? menu.dataset.nmMenu : null, range: menu ? menu.querySelector('.nm-inline-menu-range').value : null };
});
ok(reopened.menu === 'preview' && reopened.range === '30',
  `и третото щракване го отваря пак на сегашната ширина (${reopened.range}%)`, reopened);

// Плъзгане до 70%: рамката расте ВЕДНАГА, а черновата (и начертаните формати) носят новия paramint.
const draftSlid = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const pctOf = (key) => (body.dataset[key] || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint);
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '70';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  return {
    px: Math.round(frame.getBoundingClientRect().width),
    pct: frame.dataset.nmPct,
    draft: pctOf('previewDraftFormat'),
    rendered: pctOf('format'),
    values: [...document.querySelectorAll('.nm-inline-menu [data-nm-menu-value]')].map(v => v.textContent.trim()),
  };
});
ok(draftSlid.px === Math.round(WIDE * 70 / 100) && draftSlid.pct === '70',
  `в прегледа снимката расте веднага: 70% от ${WIDE}px = ${Math.round(WIDE * 0.7)}px (${draftSlid.px}px)`, draftSlid);
ok(draftSlid.draft.join(',') === '7' && draftSlid.rendered.join(',') === '7',
  `и новият paramint влиза и в черновата, и в начертаните формати (чернова ${draftSlid.draft}, преглед ${draftSlid.rendered})`, draftSlid);

// „Отказ" в това меню връща ширината от отварянето - и на екрана, и в черновата.
const draftCancel = await page.evaluate(async ({ openDraft, openFormat }) => {
  const body = document.getElementById('modal-body');
  const pctOf = (key) => (body.dataset[key] || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint);
  document.querySelector('.nm-inline-menu [data-nm-menu-action="cancel"]').click();
  await new Promise(r => setTimeout(r, 60));
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  return {
    px: Math.round(frame.getBoundingClientRect().width),
    pct: frame.dataset.nmPct,
    draft: body.dataset.previewDraftFormat,
    format: body.dataset.format,
    draftPcts: pctOf('previewDraftFormat'),
    menu: !!document.querySelector('.nm-inline-menu'),
    sameAsBefore: body.dataset.previewDraftFormat === openDraft && body.dataset.format === openFormat,
  };
}, { openDraft: draftClick.draftFormatOpen, openFormat: draftClick.renderedFormatOpen });
ok(draftCancel.menu === false, '„Отказ" затваря менюто и в Режим Преглед');
ok(draftCancel.px === Math.round(WIDE * 30 / 100) && draftCancel.pct === '30',
  `„Отказ" връща ширината на екрана: пак 30% (${draftCancel.px}px)`, draftCancel);
ok(draftCancel.sameAsBefore && draftCancel.draftPcts.join(',') === '3',
  `и черновата се връща точно каквато беше - paramint 3 (${draftCancel.draftPcts})`, draftCancel);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-6-draft-cancelled.png` });

// Промяна, оставена без „Отказ", оцелява ЗАПИСА на черновата.
const draftSaved = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  const r = frame.getBoundingClientRect();
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
});
await page.mouse.click(draftSaved.cx, draftSaved.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const beforeSave = await dbSpansFor(DRAFT_GDID);
const saved = await page.evaluate(async () => {
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '60';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // „Обнови" прилага и затваря; после записът е истинският бутон на дъното.
  document.querySelector('.nm-inline-menu [data-nm-menu-action="update"]').click();
  await new Promise(r => setTimeout(r, 60));
  const body = document.getElementById('modal-body');
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  const before = {
    px: Math.round(frame.getBoundingClientRect().width),
    draft: (body.dataset.previewDraftFormat || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint),
  };
  const saveBtn = document.getElementById('note-save-btn');
  const hadSave = !!saveBtn && getComputedStyle(saveBtn).display !== 'none';
  saveBtn.click();
  return { hadSave, before };
});
ok(saved.hadSave && saved.before.px === Math.round(WIDE * 60 / 100),
  `в черновата ширината е 60% преди записа (${saved.before.px}px)`, saved);
const afterSave = await waitDbParamintFor(DRAFT_GDID, 6);
ok(afterSave && afterSave.paramints && afterSave.paramints.includes(6),
  `след ЗАПИС на черновата бележката в източника носи новия paramint 6 (${JSON.stringify(afterSave && afterSave.paramints)})`, { beforeSave, afterSave });
ok(afterSave && afterSave.names && afterSave.names.includes(SMALL),
  `записът носи името на файла, значи е същото място (${afterSave && afterSave.names})`, afterSave);
ok(afterSave && afterSave.version > ((beforeSave && beforeSave.version) || 0),
  `записът е вдигнал version (${beforeSave && beforeSave.version} -> ${afterSave && afterSave.version})`, { beforeSave, afterSave });

// ======================= 10. „Отказ" в режим четене не оставя нищо за запис =======================
// Записана бележка в режим четене: плъзгането се отлага (nmInlinePreviewPending) и се записва при
// ЗАТВАРЯНЕ. „Отказ" трябва да махне точно това отлагане - иначе затварянето би записало отменената
// ширина. Бележката вече е в източника с paramint 10 от раздел 7.
const readDbBefore = await dbSpansFor(GDID);
ok(readDbBefore && readDbBefore.paramints && readDbBefore.paramints.includes(10),
  `преди проверката източникът носи paramint 10 (${JSON.stringify(readDbBefore && readDbBefore.paramints)})`, readDbBefore);
await openNote({ raw: RAW, format: readDbBefore.textSpan, gdid: GDID, id: NID });
const readFrame = await frameState();
ok(!readFrame.missing && readFrame.pct === '100' && readFrame.px === WIDE,
  `бележката се отваря в режим четене със записаната ширина (${readFrame.px}px, ${readFrame.pct}%)`, readFrame);

await page.mouse.click(readFrame.cx, readFrame.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const readCancel = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const frame = body.querySelector('.nm-inline-img[data-nm-view="note"]');
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '50';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const slid = {
    px: Math.round(frame.getBoundingClientRect().width),
    pct: frame.dataset.nmPct,
    pending: nmInlinePreviewPending.size,
    pendingSteps: [...nmInlinePreviewPending.values()].map(m => Object.values(m).join(',')),
  };
  document.querySelector('.nm-inline-menu [data-nm-menu-action="cancel"]').click();
  await new Promise(r => setTimeout(r, 60));
  return {
    slid,
    after: {
      px: Math.round(frame.getBoundingClientRect().width),
      pct: frame.dataset.nmPct,
      pending: nmInlinePreviewPending.size,
      style: frame.style.width,
      menu: !!document.querySelector('.nm-inline-menu'),
    },
  };
});
ok(readCancel.slid.px === Math.round(WIDE * 50 / 100) && readCancel.slid.pending === 1,
  `плъзгането сменя рамката веднага и се отлага за запис (${readCancel.slid.px}px, отложени ${readCancel.slid.pending})`, readCancel);
ok(readCancel.after.px === WIDE && readCancel.after.pct === '100' && readCancel.after.style === WIDE + 'px',
  `„Отказ" връща рамката на записаната ширина (${readCancel.after.px}px, ${readCancel.after.style})`, readCancel);
ok(readCancel.after.pending === 0 && readCancel.after.menu === false,
  `и маха отлагането за запис, а менюто се затваря (отложени ${readCancel.after.pending})`, readCancel);

// Затваряне на прозореца: ако отменената ширина беше останала отложена, тук щеше да се запише.
const closedAfterCancel = await page.evaluate(async () => {
  const win = (typeof activeNoteWindow !== 'undefined' && activeNoteWindow) ? activeNoteWindow : null;
  const el = win ? win.el : document.getElementById('content-modal');
  const btn = el.querySelector('.modal-close');
  if (btn) btn.click(); else el.classList.remove('visible');
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const stillOpen = win ? win.open : el.classList.contains('visible');
    if (!stillOpen) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return { open: win ? win.open : el.classList.contains('visible') };
});
ok(closedAfterCancel.open === false, 'модалът се затваря след „Отказ"', closedAfterCancel);
await new Promise(r => setTimeout(r, 400));
const readDbAfter = await dbSpansFor(GDID);
ok(readDbAfter && readDbAfter.paramints && readDbAfter.paramints.join(',') === '10',
  `в източника остава старата ширина - отмененото НЕ се записва (${JSON.stringify(readDbAfter && readDbAfter.paramints)})`, { readDbBefore, readDbAfter });
ok(readDbAfter && readDbAfter.version === readDbBefore.version,
  `и version не е вдигнат, значи няма запис изобщо (${readDbBefore && readDbBefore.version} -> ${readDbAfter && readDbAfter.version})`, { readDbBefore, readDbAfter });

// ======================= 11. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('Drive заявки: ' + JSON.stringify(DRIVE.list.slice(0, 10)));
  console.log('thumbnail заявки: ' + JSON.stringify(DRIVE.thumb.slice(0, 10)));
}
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
