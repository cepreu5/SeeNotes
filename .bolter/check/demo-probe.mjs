// Проба: как изглежда демо режимът в истински Chromium — кой борд, кои карти, кои бутони.
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(m.text().slice(0, 200)));
page.on('pageerror', e => logs.push('PAGEERROR ' + String(e.message).slice(0, 300)));

await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const dump = await page.evaluate(async () => {
  const out = {};
  out.demoFlag = window.__cxDemoMode;
  out.debugFlag = (typeof debug !== 'undefined') ? debug : 'undef';
  out.cacheName = (typeof CACHE_NAME !== 'undefined') ? CACHE_NAME : 'undef';
  out.demoRequest = (typeof DEMO_MODE_REQUEST !== 'undefined') ? DEMO_MODE_REQUEST : 'undef';
  out.dbName = (typeof NOTES_DB_NAME !== 'undefined') ? NOTES_DB_NAME : 'undef';
  out.bannerVisible = (() => { const b = document.getElementById('demo-banner'); return b ? !b.hidden && getComputedStyle(b).display !== 'none' : 'no-el'; })();
  out.databases = (await indexedDB.databases()).map(d => d.name);
  out.noteCards = document.querySelectorAll('.note').length;
  out.boards = (typeof boardsData !== 'undefined' && boardsData) ? boardsData.map(b => b.title) : 'undef';
  out.notesInData = (typeof allNotesData !== 'undefined' && allNotesData) ? allNotesData.length : 'undef';
  const card = document.querySelector('.note');
  out.cardHTML = card ? card.outerHTML.slice(0, 1200) : null;
  return out;
});
console.log(JSON.stringify(dump, null, 2));
console.log('--- LOGS ---');
console.log(logs.slice(-40).join('\n'));

await browser.close();
srv.close();
