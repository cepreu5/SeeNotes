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
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);
const out = await page.evaluate(async () => {
  const base = { alarm_type: -1, boardid: 'demo-board-welcome', calendarDate: 0, color: 'ffffee',
    date: Date.now(), datemod: Date.now(), eventId: 0, numord: 5, pass: false, sellist: 0,
    status: 0, text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243 };
  await bulkPutDB(NOTE_STORE_NAME, [{ ...base, gdid: 'demo-note-x', id: 9, notetxt: 'Заглавие ред\nвторо' }], true);
  await fetchAllDataLocal();
  await renderUI({ boardParseError: false });
  const cards = Array.from(document.querySelectorAll('.note'));
  return cards.map(c => ({ cls: c.className, html: c.outerHTML.slice(0, 700) }));
});
console.log(JSON.stringify(out, null, 2));
await browser.close(); srv.close();
