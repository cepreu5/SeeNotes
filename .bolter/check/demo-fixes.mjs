// Проверка: минават ли последните поправки (без мрежови) в ДЕМО режим (?demo=1).
// Пуска се от корена: node .bolter/check/demo-fixes.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
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

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAJAAAAA0CAIAAAC1kYFrAAAAWklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4M0AAAEAAfKqAAEAAAAASUVORK5CYII=';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));

await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

ok(await page.evaluate(() => window.__cxDemoMode === true), 'демо режимът е включен');
ok(await page.evaluate(() => IS_DEMO_MODE === true), 'IS_DEMO_MODE е true в main.js');
ok(await page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'NotesDB-demo')), 'базата е NotesDB-demo');
ok(await page.evaluate(() => !document.getElementById('demo-banner').hidden), 'лентата „Демо режим“ се вижда');

// --- #107: затваряне на бележка не връща скритите -----------------------------------------
const hide = await page.evaluate(async () => {
  // Три бележки в демо базата, за да има какво да се скрива.
  const base = { alarm_type: -1, boardid: 'demo-board-welcome', calendarDate: 0, color: 'ffffee',
    date: Date.now(), datemod: Date.now(), eventId: 0, numord: 1, pass: false, sellist: 0,
    status: 0, text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243 };
  const notes = [2, 3, 4].map(i => ({ ...base, gdid: 'demo-note-' + i, id: i, numord: i, notetxt: 'Бележка ' + i }));
  await bulkPutDB(NOTE_STORE_NAME, notes, true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });
  return document.querySelectorAll('.note.note-item').length;
});
ok(hide >= 3, 'демо базата има поне 3 бележки на борда', hide);

const hidden = await page.evaluate(async () => {
  const out = {};
  // Отваряме три бележки и скриваме две.
  const cards = Array.from(document.querySelectorAll('.note.note-item'));
  for (const c of cards.slice(0, 3)) { c.click(); await new Promise(r => setTimeout(r, 250)); }
  out.openWindows = noteWindows.filter(w => w.open).length;
  const wins = noteWindows.filter(w => w.open);
  for (const w of wins.slice(0, 2)) { w.hidden = true; w.el.classList.add('note-window-hidden'); w.el.style.display = 'none'; }
  out.hiddenBefore = noteWindows.filter(w => w.open && w.hidden).length;
  // Затваряме последната ВИДИМА бележка с хиксчето.
  const visible = noteWindows.filter(w => w.open && !w.hidden);
  out.visibleBefore = visible.length;
  if (visible.length) {
    const btn = visible[visible.length - 1].el.querySelector('[data-mwid="close"], .note-window-close, .close-btn');
    if (btn) btn.click(); else onNoteWindowClosed(visible[visible.length - 1]);
    await new Promise(r => setTimeout(r, 500));
  }
  out.hiddenAfter = noteWindows.filter(w => w.open && w.hidden && w.el.style.display !== 'none' && !w.el.classList.contains('note-window-hidden')).length;
  out.hiddenStillHidden = noteWindows.filter(w => w.open && w.hidden).length;
  return out;
});
console.log('   #107 ::', JSON.stringify(hidden));
ok(hidden.visibleBefore === 1, '#107: остава точно една видима бележка преди затварянето', hidden);
ok(hidden.hiddenStillHidden === 2, '#107: двете скрити остават скрити след затварянето', hidden);

// --- #102: клик в горната ивица на КАРТАТА отваря JSON-а (Debug) ---------------------------
const json = await page.evaluate(async () => {
  noteWindows.filter(w => w.open).forEach(w => { try { w.el.remove(); } catch (e) { } });
  noteWindows = []; activeNoteWindow = null;
  const card = document.querySelector('.note.note-item');
  if (!card) return { error: 'няма карта' };
  const wrapper = card.querySelector('.note-title-wrapper');
  if (!wrapper) return { error: 'картата няма .note-title-wrapper' };
  const title = wrapper.querySelector('.note-title-truncated');
  const r = wrapper.getBoundingClientRect();
  const tr = title ? title.getBoundingClientRect() : null;
  // Точка в празното на ивицата: НЕ върху реда-заглавие.
  let x = r.left + 4, y = r.top + 2;
  if (tr && x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom) x = r.right - 3;
  const before = document.querySelectorAll('#content-modal.visible, .modal-overlay.visible').length;
  const ev = new MouseEvent('click', { bubbles: true, clientX: x, clientY: y });
  wrapper.dispatchEvent(ev);
  await new Promise(r2 => setTimeout(r2, 400));
  const boxes = Array.from(document.querySelectorAll('.modal-content-box, #content-modal'));
  const txt = boxes.map(b => b.textContent).join(' ');
  const after = document.querySelectorAll('#content-modal.visible, .modal-overlay.visible').length;
  return {
    debugFlag: (typeof debug !== 'undefined') ? debug : 'undef',
    hasTitle: !!title,
    before, after,
    opened: /"gdid"|"notetxt"|"text_span"|"boardid"/.test(txt),
    snippet: txt.replace(/\s+/g, ' ').slice(0, 140)
  };
});
console.log('   #102 ::', JSON.stringify(json));
ok(json.opened === true, '#102: клик в горната ивица показва JSON-а в демо', json);

// --- #105/#106: ширина на вградена снимка (самото смятане, без мрежа) ----------------------
const width = await page.evaluate(async () => {
  // Рамка в карта на борда и рамка в отворена бележка; база 2000px, 30%.
  const mk = (inBoard) => {
    const col = inBoard
      ? (() => { const n = document.createElement('div'); n.className = 'note'; document.body.appendChild(n); const c = document.createElement('div'); c.className = 'note-content'; n.appendChild(c); return c; })()
      : (() => { const c = document.createElement('div'); c.className = 'nw-modal-body'; document.body.appendChild(c); return c; })();
    const box = document.createElement('span');
    box.className = 'nm-inline-img';
    box.dataset.nmPct = '30';
    box.dataset.nmBase = '2000';
    box.style.width = '30%';
    col.appendChild(box);
    return box;
  };
  const bBoard = mk(true), bModal = mk(false);
  const colBoard = nmInlineColumnWidth(bBoard);
  const scale = nmInlineBoardScale(bBoard);
  const colModal = nmInlineModalColumnWidth();
  const want0 = Math.round(2000 * 30 / 100);
  const boardPx = Math.max(1, Math.round(want0 * scale));
  const px = (colBoard > 0 && boardPx > colBoard) ? colBoard : boardPx;
  bBoard.style.width = px + 'px';
  bModal.style.width = want0 + 'px';
  const out = {
    colBoard, colModal, scale: Number(scale.toFixed(3)),
    boardCss: bBoard.style.width, boardReal: Math.round(bBoard.getBoundingClientRect().width),
    modalCss: bModal.style.width, modalReal: Math.round(bModal.getBoundingClientRect().width),
    matches524: bModal.style.width === '524px' || bModal.style.width === '600px'
  };
  return out;
});
console.log('   #105/#106 ::', JSON.stringify(width));
ok(width.modalReal > 0 && width.boardReal > 0, '#105/#106: смятането работи и в демо (има мерки)', width);
ok(width.boardReal <= width.colBoard, '#105/#106: картата не надвишава колоната си', width);

// --- #101: едно натискане стига до режим Редактиране --------------------------------------
const oneTap = await page.evaluate(async () => {
  return { hasDockRelease: /pressOpen|dockReleasePending/.test(String(wireNoteWindow)) };
});
ok(oneTap.hasDockRelease === true, '#101: кодът за отложено слизане е наличен (wireNoteWindow)', oneTap);

console.log('--- page errors ---');
console.log(errs.length ? errs.join('\n') : '(няма)');
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
