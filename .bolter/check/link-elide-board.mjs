// A long URL in a note must be cut with "…" on the board, exactly like in the modal preview.
// Run from the repo root: node .bolter/check/link-elide-board.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const PORT = 8792;
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const b = await readFile(path.join(root, p === '/' ? 'index.html' : p));
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store'}); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT);

let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m, extra !== undefined ? JSON.stringify(extra) : ''); };

const URL_LONG = 'https://example.com/very/long/path/that/definitely/does/not/fit/in/a/narrow/note/card/at/all/index.html?query=1';
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const consoleErrors = [];

for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrors.push(`${width}px: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`${width}px pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 15000 });

  const r = await page.evaluate((u) => {
    const mk = (el, w) => { el.style.width = w + 'px'; el.style.position = 'fixed'; el.style.left = '-9999px'; el.style.top = '0'; document.body.appendChild(el); return el; };
    const board = mk(document.createElement('div'), 220);
    board.className = 'note-content';
    board.innerHTML = getFormattedNoteHtml('Виж ' + u + ' и още.', null, null, false, null);
    const modal = mk(document.createElement('div'), 420);
    modal.id = 'modal-body';
    modal.innerHTML = getFormattedNoteHtml('Виж ' + u + ' и още.', null, null, true, undefined);
    const boardEl = board.querySelector('.nmd-link-elide');
    const bs = boardEl ? getComputedStyle(boardEl) : null;
    const out = {
      boardHasSpan: !!boardEl,
      boardAnchor: !!board.querySelector('a'),
      boardText: (board.textContent || ''),
      boardStyle: bs ? { ws: bs.whiteSpace, ov: bs.overflow, to: bs.textOverflow, w: Math.round(boardEl.getBoundingClientRect().width), h: Math.round(boardEl.getBoundingClientRect().height) } : null,
      // the URL must fit on one line inside the 220px card, not wrap over several
      boardLines: boardEl ? Math.round(boardEl.getBoundingClientRect().height / parseFloat(getComputedStyle(boardEl).lineHeight || '16')) : null,
      modalAnchor: !!modal.querySelector('a'),
      boardOverflow: board.scrollWidth - board.clientWidth,
    };
    board.remove(); modal.remove();
    return out;
  }, URL_LONG);

  ok(r.boardHasSpan, `${width}: board URL is wrapped for eliding`);
  ok(!r.boardAnchor, `${width}: board URL stays plain text (no link) unless one-tap is on`);
  ok(r.boardStyle && r.boardStyle.ws === 'nowrap' && r.boardStyle.to === 'ellipsis', `${width}: board URL is nowrap + ellipsis`, r.boardStyle);
  ok(r.boardStyle && r.boardStyle.w <= 220, `${width}: board URL is clamped to the card width`, r.boardStyle && r.boardStyle.w);
  ok(r.boardStyle && r.boardStyle.h <= 22, `${width}: board URL stays on one line`, r.boardStyle && r.boardStyle.h);
  ok(r.boardText.includes(URL_LONG), `${width}: full URL is still the full text (elided visually, not in the DOM)`);
  ok(r.modalAnchor, `${width}: modal preview still renders the URL as a link`);
  ok(r.boardOverflow <= 0, `${width}: no horizontal overflow from the long URL`, r.boardOverflow);
  await ctx.close();
}

// a short URL must not be touched at all
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
  const short = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'note-content'; el.style.width = '400px';
    el.style.position = 'fixed'; el.style.left = '-9999px';
    el.innerHTML = getFormattedNoteHtml('Виж https://a.bg и още.', null, null, false, null);
    document.body.appendChild(el);
    const s = el.querySelector('.nmd-link-elide');
    const w = s ? Math.round(s.getBoundingClientRect().width) : -1;
    const r = { w, text: el.textContent };
    el.remove(); return r;
  });
  ok(short.w > 0 && short.w < 200, `short URL keeps its natural width (not stretched to the card)`, short.w);
  ok(short.text.includes('https://a.bg'), 'short URL text intact', short.text);
  await ctx.close();
}

ok(consoleErrors.length === 0, 'no console errors', consoleErrors);
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
