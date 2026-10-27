// Демо: влиза ли бележка в режим Редактиране (enableNoteEditing) и работи ли „Запис“ с едно натискане (#101).
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
const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/index.html?demo=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.waitForTimeout(9000);

const r = await page.evaluate(async () => {
  const card = document.querySelector('.note.note-item');
  card.click();
  await new Promise(r => setTimeout(r, 900));
  const win = noteWindows.find(w => w.open);
  if (!win) return { error: 'прозорецът не се отвори' };
  const body = win.el.querySelector('.nw-modal-body') || win.body;
  if (!body) return { error: 'няма тяло' };
  enableNoteEditing(body, -1);
  await new Promise(r => setTimeout(r, 600));
  const ta = win.el.querySelector('#note-edit-textarea');
  const out = {
    hasTextarea: !!ta,
    hasToolbar: !!win.el.querySelector('.modal-edit-toolbar'),
    saveBtn: null, onePress: null
  };
  const btn = win.el.querySelector('.modal-header-btn.is-save, [data-mwid="save"], .modal-edit-toolbar .modal-header-btn');
  out.saveBtn = btn ? (btn.className || btn.id || 'btn') : null;
  // Състоянието на отлагането: pressOpen / dockRelease иска истинско натискане; тук проверяваме,
  // че след натискане върху „Запис“ бележката не слиза преди click (класът идва от setNoteKeyboardDock).
  if (ta) {
    ta.focus();
    await new Promise(r2 => setTimeout(r2, 200));
    out.dockedAfterFocus = win.el.classList.contains('note-window-kb-top');
  }
  return out;
});
console.log(JSON.stringify(r, null, 2));
console.log('errors:', errs.join(' | ') || '(none)');
await browser.close(); srv.close();
