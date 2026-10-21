// Човешко поведение: цъкаме стрелката, която ВИЖДАМЕ на активния прозорец, на нейните реални координати.
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index-2.html' : p;
  try { const b = await readFile(path.join(root, rel)); res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.gapi = { load() { }, client: { setToken() { }, getToken() { return { access_token: 'tok' }; }, drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } } } };
  window.showDirectoryPicker = undefined;
});
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof getOpenNoteWindows === 'function', null, { timeout: 20000 });
await page.evaluate(() => {
  localStorage.setItem('lang', currentLang || 'bg'); localStorage.removeItem('singleNoteMode');
  notesContainer = document.getElementById('notes-container'); searchBox = document.getElementById('search-box');
  if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
  initNoteWindows(); removeGuide();
});
for (let i = 1; i <= 4; i++) {
  await page.evaluate((i) => showModal({ raw: 'бележка ' + i, format: null, id: 'L' + i, gdid: 'GL' + i, boardId: 'B1' }), i);
  await page.waitForFunction((n) => getOpenNoteWindows().length === n, i, { timeout: 8000 });
}
const active = () => page.evaluate(() => activeNoteWindow ? (activeNoteWindow.body.textContent || '').trim() : null);
const spot = () => page.evaluate(() => {
  const btn = activeNoteWindow.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  const r = btn.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const top = document.elementFromPoint(cx, cy);
  const own = top && top.closest ? top.closest('.note-window') : null;
  const b = own && own.querySelector('[data-mwid="modal-body"], #modal-body');
  return { x: cx, y: cy, topIsButton: top === btn, topOwner: b ? b.textContent.trim() : null };
});
const seq = [];
for (let k = 1; k <= 6; k++) {
  const s = await spot();
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(1300);
  seq.push(await active());
  console.log(`клик ${k} @${s.x},${s.y} (на върха: ${s.topIsButton ? 'самата стрелка' : s.topOwner}) -> ${seq[seq.length - 1]}`);
}
// Важното е всеки клик да мести на СЛЕДВАЩАТА по кръга 1->2->3->4->1, независимо откъде тръгва.
const names = seq.map(s => Number((s.match(/\d+/) || [0])[0]));
const ok = names.every((v, i) => i === 0 || v === (names[i - 1] % 4) + 1);
console.log(JSON.stringify(seq));
console.log(ok ? 'PASS' : 'FAIL: не върви по кръга');
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
