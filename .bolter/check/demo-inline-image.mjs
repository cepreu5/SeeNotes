// Демо режим: могат ли вградените снимки (type=8) да се покажат изобщо, след като няма Drive?
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
const blocked = [];
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => {
  urls.push(r.request().url());
  return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const urls = [];
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

const out = await page.evaluate(async () => {
  const out = { mode: await inlineImageSourceMode() };
  // Бележка с вградена снимка по име + запис в media.txt (и двете само в демо базата).
  const now = Date.now();
  const txt = 'Текст преди * снимката';
  const note = {
    alarm_type: -1, boardid: 'demo-board-welcome', calendarDate: 0, color: 'ffffee',
    date: now, datemod: now, eventId: 0, gdid: 'demo-note-img', id: 21, numord: 1,
    notetxt: txt, pass: false, sellist: 0, status: 0,
    text_span: JSON.stringify({ start: 13, end: 14, type: 8, paramstring: 'demo-photo.jpg', paramint: 30 }),
    timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
  };
  const media = { datemod: now, description: '', gdid: 'demo-media-1', id: 1, noteid: 'demo-note-img',
    path: 'demo-photo.jpg', pathGD: 'DEMO_DRIVE_ID', type: 1 };
  await bulkPutDB(NOTE_STORE_NAME, [note], true);
  await bulkPutDB(MEDIA_STORE_NAME, [media], true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });
  await new Promise(r => setTimeout(r, 2500));
  const box = document.querySelector('.nm-inline-img[data-nm-file]');
  out.foundBox = !!box;
  if (box) {
    out.state = box.dataset.nmState;
    out.width = getComputedStyle(box).width;
    out.hasImg = !!box.querySelector('img');
    out.imgSrcScheme = box.querySelector('img') ? String(box.querySelector('img').src).split(':')[0] : null;
    out.className = box.className;
  }
  out.inlineBoxes = document.querySelectorAll('.nm-inline-img').length;
  out.triedDrive = (window.__drive && window.__drive.list) ? window.__drive.list.length : 'no-gapi';
  return out;
});

// Колко външни адреса е поискала страницата (демо бариерата би трябвало да ги откаже)
console.log(JSON.stringify(out, null, 2));
console.log('external urls asked:', JSON.stringify(urls.slice(0, 12), null, 1));
console.log('errors:', errs.join(' | ') || '(none)');
await browser.close(); srv.close();
