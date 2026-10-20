// The header of a note window when it is dragged narrow (b2.36). Run from the repo root:
//   node .bolter/check/modal-header-narrow.mjs      (exit 1 on any failed assertion)
//
// The bug this guards: at ~250px and below, the header grid's second column was max-content and
// could not shrink, so the whole grid overflowed the window - the top row's buttons painted 9-99px
// past the right edge over the transparent overlay, and the edit strip below (grid-column 1 / -1)
// stretched to that overflowed width, so its sideways scroll and its is-scrollable fade began ~100px
// past the real right edge.
//
// For viewports 1280 and 390 it opens a note in the real editor, then for box widths
// default, 360, 300, 240, 200, 180, 150 asserts:
//   - the header grid is never wider than the box (scrollWidth == clientWidth)
//   - the button row sits inside the box, its buttons are 32px and never squashed,
//     and every one of them is reachable (the row scrolls when they do not fit)
//   - Close is fully inside the box and elementFromPoint at its centre hits it
//   - the edit strip's clientWidth is the box's inner width, so its scroll and fade start at the
//     real right edge; its chips are clipped by the box, and the last one scrolls into view
//   - (default width only) the strip is still one row of 28px chips with a 3px gap, ↶ ↷ first,
//     no fade, and the header row is unchanged: right-aligned, Close 15px from the box edge.
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const PORT = 8787;
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
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const consoleErrors = [];

async function openEditor(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 }, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/^Failed to load resource/.test(m.text())) return; // favicon / stubbed Google scripts
    consoleErrors.push(`${width}px: ${m.text()}`);
  });
  page.on('pageerror', e => consoleErrors.push(`${width}px pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction(() => typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
  await page.evaluate(() => {
    showModal({ raw: 'Първи ред на бележката. Втори ред, който е достатъчно дълъг, за да покаже как текстът стои под хедъра.', id: 'hdr-narrow' });
    enableNoteEditing(document.getElementById('modal-body'));
  });
  await page.waitForSelector('#content-modal .modal-edit-toolbar');
  await page.waitForFunction(() => document.querySelectorAll('#content-modal .modal-edit-toolbar > *').length >= 11);
  // The box fades in with transform: scale(0.7) -> scale(1); measuring mid-transition reads short.
  await page.waitForFunction(() => {
    const box = document.querySelector('#content-modal .modal-content-box');
    const m = box && getComputedStyle(box).transform;
    const btn = document.querySelector('#content-modal .modal-edit-toolbar-btn');
    return (m === 'none' || m === 'matrix(1, 0, 0, 1, 0, 0)') && btn && Math.round(btn.getBoundingClientRect().width) === 28;
  }, null, { timeout: 8000 });
  return { ctx, page };
}

// Set the window width, then wait for the layout and the strip's ResizeObserver to agree on the
// fade class instead of sleeping.
const setWidth = (page, w) => page.evaluate(async (w) => {
  const box = document.querySelector('#content-modal .modal-content-box');
  if (w) box.style.width = w + 'px';
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const strip = box.querySelector('.modal-edit-toolbar');
  for (let i = 0; i < 20; i++) {
    await frame();
    const shouldFade = strip.scrollWidth > strip.clientWidth + 1;
    if (strip.classList.contains('is-scrollable') === shouldFade) break;
  }
  await frame();
  return Math.round(box.getBoundingClientRect().width);
}, w);

const snapshot = (page) => page.evaluate(() => {
  const box = document.querySelector('#content-modal .modal-content-box');
  const rect = el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
  const hdr = box.querySelector('.modal-header-toolbar');
  const row = box.querySelector('.modal-header-buttons');
  const close = box.querySelector('.modal-close');
  const strip = box.querySelector('.modal-edit-toolbar');
  const cs = getComputedStyle(box);
  const btns = [...row.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
    title: (b.title || b.textContent || '').trim().slice(0, 20), ...rect(b), w: Math.round(b.getBoundingClientRect().width),
  }));
  const chips = [...strip.querySelectorAll(':scope > *')].map(el => ({
    ...rect(el), label: (el.textContent || '').trim().slice(0, 4), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height),
  }));
  const c = close.getBoundingClientRect();
  const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
  return {
    box: rect(box), boxW: Math.round(c.width),
    innerW: Math.round(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
    hdr: rect(hdr), hdrScroll: hdr.scrollWidth, hdrClient: hdr.clientWidth,
    row: rect(row), rowScroll: row.scrollWidth, rowClient: row.clientWidth, rowScrollLeft: row.scrollLeft,
    btns, close: rect(close),
    closeHit: !hit ? 'none' : (hit === close || close.contains(hit) ? 'close' : (hit.id || hit.className || hit.tagName)),
    strip: rect(strip), stripScroll: strip.scrollWidth, stripClient: strip.clientWidth,
    stripFade: strip.classList.contains('is-scrollable'),
    chips,
    chipRows: [...new Set(chips.map(c2 => Math.round(c2.top)))].length,
    chipGap: Math.round((chips[1].left - chips[0].right) * 10) / 10,
  };
});

// Move a container to one end of its sideways scroll and report where its buttons/chips land.
const scrollTo = (page, selector, pos) => page.evaluate(async ({ selector, pos }) => {
  const el = document.querySelector(selector);
  el.scrollLeft = pos === 'end' ? el.scrollWidth : 0;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top }; };
  return {
    scrollLeft: el.scrollLeft,
    container: rect(el),
    children: [...el.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({ title: (b.title || b.textContent || '').trim().slice(0, 20), ...rect(b) })),
  };
}, { selector, pos });

for (const viewport of [1280, 390]) {
  const { ctx, page } = await openEditor(viewport);
  console.log(`\n=== viewport ${viewport}`);

  // ---- the normal case first: nothing about it may move ----
  await setWidth(page, null);
  const base = await snapshot(page);
  ok(base.chipRows === 1, `[${viewport}] default: strip is one row`, { rows: base.chipRows });
  ok(base.chips.every(c => c.h === 28), `[${viewport}] default: every strip chip is 28px tall`, base.chips.map(c => c.h));
  ok(near(base.chipGap, 3, 0.6), `[${viewport}] default: strip chip gap is 3px`, { gap: base.chipGap });
  ok(base.chips[0].label === '↶' && base.chips[1].label === '↷', `[${viewport}] default: undo ↶ then redo ↷ come first`, base.chips.slice(0, 2).map(c => c.label));
  ok(base.stripFade === false, `[${viewport}] default: no fade when the strip fits`, { scroll: base.stripScroll, client: base.stripClient, fade: base.stripFade });
  ok(near(base.strip.right, base.box.right - 15, 1), `[${viewport}] default: strip ends at the box's right padding edge`, { stripRight: Math.round(base.strip.right), boxRight: Math.round(base.box.right) });
  ok(near(base.close.right, base.box.right - 15, 1), `[${viewport}] default: Close sits 15px from the box's right edge`, { closeRight: Math.round(base.close.right), boxRight: Math.round(base.box.right) });
  ok(base.btns.every(b => near(b.top, base.btns[0].top, 1)) && base.btns.every(b => b.w === 32), `[${viewport}] default: header buttons are one row of 32px`, base.btns.map(b => b.w));
  ok(near(base.btns[base.btns.length - 1].right, base.row.right, 1), `[${viewport}] default: the button row is right-aligned`, { lastRight: Math.round(base.btns[base.btns.length - 1].right), rowRight: Math.round(base.row.right) });
  ok(base.closeHit === 'close', `[${viewport}] default: Close is the topmost element at its centre`, base.closeHit);

  // ---- and now the dragged-narrow case ----
  for (const w of [360, 300, 240, 200, 180, 150]) {
    const measured = await setWidth(page, w);
    ok(measured === w, `[${viewport}] box ${w}: the box really is ${w}px wide`, { measured });
    const m = await snapshot(page);

    ok(m.hdrScroll <= m.hdrClient + 1, `[${viewport}] box ${w}: header grid fits the box`, { scrollW: m.hdrScroll, clientW: m.hdrClient });
    ok(m.row.right <= m.box.right + 1 && m.row.left >= m.box.left - 1, `[${viewport}] box ${w}: the button row is inside the box`, { row: [Math.round(m.row.left), Math.round(m.row.right)], box: [Math.round(m.box.left), Math.round(m.box.right)] });
    ok(m.btns.every(b => b.w === 32), `[${viewport}] box ${w}: no header button is squashed`, m.btns.map(b => b.w));

    // Visible button at the start of the row: never painted past the box, and its painted part is
    // positive (a button may be clipped by the row's own scroll edge, never by the box's outside).
    const first = m.btns[0];
    ok(first.left >= m.row.left - 1, `[${viewport}] box ${w}: the first button starts inside the row`, { firstLeft: Math.round(first.left), rowLeft: Math.round(m.row.left) });
    const last = m.btns[m.btns.length - 1];
    const fitsNow = last.right <= m.row.right + 1;
    const scrolls = m.rowScroll > m.rowClient + 1;
    ok(fitsNow || scrolls, `[${viewport}] box ${w}: the last button either fits or the row scrolls`, { lastRight: Math.round(last.right), rowRight: Math.round(m.row.right), scrollW: m.rowScroll, clientW: m.rowClient });
    ok(Math.min(last.right, m.row.right) <= m.box.right + 1, `[${viewport}] box ${w}: the last button never paints past the box edge`, { paintedRight: Math.round(Math.min(last.right, m.row.right)), boxRight: Math.round(m.box.right) });

    const end = await scrollTo(page, '#content-modal .modal-header-buttons', 'end');
    const lastAtEnd = end.children[end.children.length - 1];
    ok(lastAtEnd.right <= end.container.right + 1 && lastAtEnd.left >= end.container.left - 1,
      `[${viewport}] box ${w}: every header button is reachable (last one scrolls fully into view)`,
      { title: lastAtEnd.title, left: Math.round(lastAtEnd.left), right: Math.round(lastAtEnd.right), row: [Math.round(end.container.left), Math.round(end.container.right)] });
    await scrollTo(page, '#content-modal .modal-header-buttons', 'start');

    const afterScroll = await snapshot(page);
    ok(afterScroll.close.right <= afterScroll.box.right + 1 && afterScroll.close.left >= afterScroll.box.left - 1
      && afterScroll.close.top >= afterScroll.box.top - 1 && afterScroll.close.bottom <= afterScroll.box.bottom + 1,
      `[${viewport}] box ${w}: Close is fully inside the box`, { close: [Math.round(afterScroll.close.left), Math.round(afterScroll.close.right)], box: [Math.round(afterScroll.box.left), Math.round(afterScroll.box.right)] });
    ok(afterScroll.closeHit === 'close', `[${viewport}] box ${w}: elementFromPoint at Close's centre hits Close`, afterScroll.closeHit);

    ok(afterScroll.strip.right <= afterScroll.box.right + 1 && afterScroll.strip.left >= afterScroll.box.left - 1,
      `[${viewport}] box ${w}: the edit strip is inside the box`, { strip: [Math.round(afterScroll.strip.left), Math.round(afterScroll.strip.right)], box: [Math.round(afterScroll.box.left), Math.round(afterScroll.box.right)] });
    ok(near(afterScroll.stripClient, afterScroll.innerW, 1),
      `[${viewport}] box ${w}: strip clientWidth equals the box's inner width (scroll + fade start at the real edge)`,
      { stripClient: afterScroll.stripClient, boxInner: afterScroll.innerW });
    const stripScrolls = afterScroll.stripScroll > afterScroll.stripClient + 1;
    ok(afterScroll.stripFade === stripScrolls, `[${viewport}] box ${w}: the strip fades exactly when it overflows`, { scroll: afterScroll.stripScroll, client: afterScroll.stripClient, fade: afterScroll.stripFade });
    const lastChipNow = afterScroll.chips[afterScroll.chips.length - 1];
    ok(lastChipNow.right <= afterScroll.strip.right + 1 || stripScrolls,
      `[${viewport}] box ${w}: the last strip chip fits or the strip scrolls`, { chipRight: Math.round(lastChipNow.right), stripRight: Math.round(afterScroll.strip.right), scrolls: stripScrolls });
    if (stripScrolls) {
      const chipEnd = await scrollTo(page, '#content-modal .modal-edit-toolbar', 'end');
      const chipLast = chipEnd.children[chipEnd.children.length - 1];
      ok(chipLast.right <= chipEnd.container.right + 1, `[${viewport}] box ${w}: the last strip chip scrolls into view`, { right: Math.round(chipLast.right), stripRight: Math.round(chipEnd.container.right) });
      await scrollTo(page, '#content-modal .modal-edit-toolbar', 'start');
    }
    // Chips that are scrolled past the strip's own right edge are clipped there, never painted on
    // the overlay: the strip's inner edge must be the box's edge, which is the assertion above.
    ok(afterScroll.chips.every(c => c.h === 28), `[${viewport}] box ${w}: strip chips keep their 28px height`, [...new Set(afterScroll.chips.map(c => c.h))]);
  }
  await setWidth(page, 150);
  await page.screenshot({ path: `.bolter/check/modal-header-narrow-${viewport}-150.png` });
  await setWidth(page, null);
  await page.screenshot({ path: `.bolter/check/modal-header-narrow-${viewport}-default.png` });
  await ctx.close();
}

ok(consoleErrors.length === 0, 'no console errors', consoleErrors.slice(0, 5));
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} assertions passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
