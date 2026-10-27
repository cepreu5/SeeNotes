// Демо: има ли източник на данни (dbSourceGlobal) и стига ли прикачен файл до картинка?
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

const state = await page.evaluate(async () => {
  const st = {
    dbSourceGlobal, dbNoteIdTypeGlobal,
    useIndexedDb, useGoogleDb, useLocalFolder, useArhDb,
    mode: await inlineImageSourceMode(),
    configDbSource: await (async () => { try { return await getConfig('dbSource'); } catch (e) { return 'err:' + e.message; } })()
  };
  // Бележка с прикачен файл в демо базата
  const now = Date.now();
  const note = { alarm_type: -1, boardid: 'demo-board-welcome', calendarDate: 0, color: 'ffffee',
    date: now, datemod: now, eventId: 0, gdid: 'demo-note-att', id: 41, numord: 1,
    notetxt: 'с прикачен файл', pass: false, sellist: 0, status: 0, text_span: '',
    timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243 };
  const media = { datemod: now, description: '', gdid: 'demo-media-att', id: 11, noteid: 'demo-note-att',
    path: 'att.jpg', pathGD: 'DEMO_ID', type: 1 };
  await bulkPutDB(NOTE_STORE_NAME, [note], true);
  await bulkPutDB(MEDIA_STORE_NAME, [media], true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });
  await new Promise(r => setTimeout(r, 2000));
  st.attachmentWrappers = document.querySelectorAll('[data-type]').length;
  st.tilesWithPhoto = document.querySelectorAll('.modal-attachment-tile.has-photo, [data-state="ready"]').length;
  st.tilesLoading = document.querySelectorAll('[data-state="loading"]').length;
  return st;
});
console.log(JSON.stringify(state, null, 2));
console.log('errors:', errs.join(' | ') || '(none)');
await browser.close(); srv.close();
