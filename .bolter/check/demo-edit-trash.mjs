// Демо: (а) влиза ли бележка в режим Редактиране (#101), (б) трие ли кошчето бордове (#99),
// (в) има ли MNV изобщо демо режим.
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index.html' : p;
  try { const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

// (а) #101: натискане върху бележка я вкарва в режим Редактиране
const editing = await page.evaluate(async () => {
  const card = document.querySelector('.note.note-item');
  if (!card) return { error: 'няма карта' };
  card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'touch' }));
  card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'touch' }));
  card.click();
  await new Promise(r => setTimeout(r, 900));
  const win = noteWindows.find(w => w.open);
  const body = win ? win.el.querySelector('.nw-modal-body') : null;
  return {
    windowOpened: !!win,
    contenteditable: body ? body.getAttribute('contenteditable') : null,
    hasEditArea: !!document.querySelector('#note-edit-textarea, [contenteditable="true"]'),
    editingClass: win ? /edit/i.test(win.el.className) : null
  };
});
console.log('(а) #101 редактиране в демо:', JSON.stringify(editing));

// (б) #99: борд със status 1 в кошчето; изпразването трябва да го изтрие
const trash = await page.evaluate(async () => {
  const board = { backcolor: 0, backnum: 0, backpath: '', color: '#4CAF50', colorfont: '#000',
    datemod: Date.now(), gdid: 'demo-board-trash', id: 2, numord: 2, status: 1, title: 'За кошче' };
  const now = Date.now();
  const note = { alarm_type: -1, boardid: 'demo-board-trash', calendarDate: 0, color: 'ffffee',
    date: now, datemod: now, eventId: 0, gdid: 'demo-note-trash', id: 31, numord: 1, notetxt: 'в кошчето',
    pass: false, sellist: 0, status: 1, text_span: '', timer: 0, timer_type: -1, timer_val: 1,
    title_span: '', type: 0, version: 243 };
  await bulkPutDB(BOARD_STORE_NAME, [board], true);
  await bulkPutDB(NOTE_STORE_NAME, [note], true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });
  const before = { boards: (boardsData || []).length, notes: (allNotesData || []).length };
  const fn = (typeof emptyTrash === 'function') ? 'emptyTrash'
    : (typeof deleteAllTrash === 'function') ? 'deleteAllTrash'
    : (typeof emptyTrashBin === 'function') ? 'emptyTrashBin' : null;
  return { before, fnNames: Object.keys(window).filter(k => /trash|Trash/i.test(k)).slice(0, 12), fn };
});
console.log('(б) #99 кошче в демо:', JSON.stringify(trash));

console.log('errors:', errs.join(' | ') || '(none)');
await browser.close(); srv.close();
