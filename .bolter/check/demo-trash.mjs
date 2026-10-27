// Демо: изпразва ли се кошчето заедно с борд status 1 (#99) — и стига ли до Drive изобщо.
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

const trash = await page.evaluate(async () => {
  const now = Date.now();
  const board = { backcolor: 0, backnum: 0, backpath: '', color: '#4CAF50', colorfont: '#000',
    datemod: now, gdid: 'demo-board-trash', id: 2, numord: 2, status: 1, title: 'За кошче' };
  const note = { alarm_type: -1, boardid: 'demo-board-trash', calendarDate: 0, color: 'ffffee',
    date: now, datemod: now, eventId: 0, gdid: 'demo-note-trash', id: 31, numord: 1, notetxt: 'в кошчето',
    pass: false, sellist: 0, status: 1, text_span: '', timer: 0, timer_type: -1, timer_val: 1,
    title_span: '', type: 0, version: 243 };
  await bulkPutDB(BOARD_STORE_NAME, [board], true);
  await bulkPutDB(NOTE_STORE_NAME, [note], true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });

  const beforeBoards = (boardsData || []).map(b => b.gdid);
  // Бутонът съществува само в кошчето — слагаме го, за да не излезе функцията веднага.
  let fab = document.getElementById('empty-trash-fab');
  if (!fab) { fab = document.createElement('button'); fab.id = 'empty-trash-fab'; fab.style.display = 'block'; document.body.appendChild(fab); }
  const oldConfirm = window.showConfirmation;
  window.showConfirmation = async () => true; // потвърждението не е предмет на проверката
  let error = null;
  try { await emptyTrash(); } catch (e) { error = String(e.message || e); }
  window.showConfirmation = oldConfirm;
  await new Promise(r => setTimeout(r, 1200));
  await fetchAllDataLocal();
  const afterBoards = (boardsData || []).map(b => b.gdid);
  const after = await new Promise(res => {
    const req = indexedDB.open(NOTES_DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction([BOARD_STORE_NAME, NOTE_STORE_NAME], 'readonly');
      let nb = 0, nn = 0;
      tx.objectStore(BOARD_STORE_NAME).count().onsuccess = e => { nb = e.target.result; };
      tx.objectStore(NOTE_STORE_NAME).count().onsuccess = e => { nn = e.target.result; };
      tx.oncomplete = () => res({ boards: nb, notes: nn });
    };
    req.onerror = () => res({ error: 'db' });
  });
  return { error, beforeBoards, afterBoards, after, driveUsed: (typeof isOffline !== 'undefined') ? !isOffline : 'undef' };
});
console.log('#99 кошче в демо:', JSON.stringify(trash, null, 1));
console.log('errors:', errs.join(' | ') || '(none)');
await browser.close(); srv.close();
