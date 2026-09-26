// The edit modal's footer buttons (attach, preview, save) stay one row on the right,
// with and without write rights, and are not duplicated when the modal is reopened.
//   node .bolter/check/footer-row.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(path.join(root, p === '/' ? 'index.html' : p)); res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8770);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const RAW = 'Footer test note\nsecond line';
const IDS = ['note-attach-btn', 'note-preview-btn', 'note-save-btn'];

async function session(W, drive) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.goto('http://localhost:8770/index.html');
  await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
  await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
  await page.evaluate(d => {
    if (d) { useGoogleDb = true; isOffline = false; useIndexedDb = true; } else { useGoogleDb = false; isOffline = true; }
  }, drive);
  const open = async () => {
    await page.evaluate(([raw, d]) => {
      if (!allNotesData.some(n => n.id === 900002)) allNotesData.push({ id: 900002, gdid: d ? 'test-2' : null, notetxt: raw, text_span: '', title_span: '', color: 0, boardid: currentBoardFilter, datemod: 1, version: 1 });
      showModal({ raw, id: 900002, gdid: d ? 'test-2' : null });
      const body = document.getElementById('modal-body'); body.dataset.id = 900002; if (d) body.dataset.gdid = 'test-2';
    }, [RAW, drive]);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#content-modal .modal-content-box')).visibility === 'visible');
    await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
    await page.waitForFunction(ids => ids.every(id => { const b = document.getElementById(id); return b && b.getBoundingClientRect().width > 0; }), IDS);
  };
  const settle = () => page.waitForFunction(() => new Promise(r => {
    // wait until no animation runs in the modal and the save button stops moving between ten frames
    const box = document.querySelector('#content-modal .modal-content-box');
    const busy = document.getAnimations().some(a => a.playState === 'running');
    const b = document.getElementById('note-save-btn'); const a1 = JSON.stringify(b.getBoundingClientRect());
    let n = 0; const step = () => (++n < 10 ? requestAnimationFrame(step) : r(!busy && box && JSON.stringify(b.getBoundingClientRect()) === a1));
    requestAnimationFrame(step);
  }), null, { timeout: 10000, polling: 100 });
  const measure = async () => { await settle(); return page.evaluate(ids => {
    const box = document.querySelector('#content-modal .modal-content-box');
    const bs = getComputedStyle(box); const br = box.getBoundingClientRect();
    const innerRight = br.right - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingRight);
    return {
      innerRight: Math.round(innerRight),
      counts: ids.map(id => document.querySelectorAll('#' + id).length),
      toolbars: box.querySelectorAll(':scope > .modal-footer-toolbar').length,
      btns: ids.map(id => { const b = document.getElementById(id); const r = b.getBoundingClientRect(); return { id, parent: b.parentElement.className, direct: b.parentElement === box, x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), w: Math.round(r.width) }; })
    };
  }, IDS); };
  const assertRow = (m, tag) => {
    console.log(`  ${tag}: innerRight=${m.innerRight} ` + m.btns.map(b => `${b.id.replace('note-', '').replace('-btn', '')}@(${b.x},${b.y},w${b.w}) in .${b.parent}`).join(' '));
    ok(m.btns.every(b => b.parent === 'modal-footer-toolbar'), `${tag}: parent is .modal-footer-toolbar`);
    ok(m.btns.every(b => !b.direct), `${tag}: none is a direct child of .modal-content-box`);
    ok(Math.max(...m.btns.map(b => b.y)) - Math.min(...m.btns.map(b => b.y)) <= 2, `${tag}: same top edge (±2px)`);
    ok(m.btns[0].x < m.btns[1].x && m.btns[1].x < m.btns[2].x, `${tag}: order attach → preview → save`);
    const gap = m.innerRight - m.btns[2].right;
    ok(gap >= 0 && gap <= 20, `${tag}: last button right edge ${m.btns[2].right} within 20px of inner right ${m.innerRight} (gap ${gap})`);
    ok(m.counts.every(c => c === 1) && m.toolbars === 1, `${tag}: one element per id, one toolbar (${m.counts.join(',')}; toolbars ${m.toolbars})`);
  };
  const tag = `${W} ${drive ? 'rights' : 'no-rights'}`;
  await open();
  assertRow(await measure(), tag);
  if (!drive) await page.screenshot({ path: `.bolter/check/footerrow-${W}.png` });
  // Leave editing: the edit-only toolbar goes away when it shows nothing; entering again restores the row.
  const afterExit = await page.evaluate(() => {
    const body = document.getElementById('modal-body');
    disableNoteEditing(body);
    body.textContent = 'Footer test note'; // as after save: the editor is replaced by the rendered note
    const box = document.querySelector('#content-modal .modal-content-box');
    return { toolbars: box.querySelectorAll('.modal-footer-toolbar').length, hidden: ['note-attach-btn', 'note-preview-btn', 'note-save-btn'].every(id => { const b = document.getElementById(id); return !b || getComputedStyle(b).display === 'none'; }) };
  });
  ok(afterExit.hidden, `${tag}: buttons hidden after leaving edit mode`);
  if (!drive) ok(afterExit.toolbars === 0, `${tag}: empty edit-only toolbar removed after leaving edit mode`);
  else ok(afterExit.toolbars === 1, `${tag}: normal toolbar kept after leaving edit mode`);
  await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
  await page.waitForFunction(ids => ids.every(id => { const b = document.getElementById(id); return b && b.getBoundingClientRect().width > 0; }), IDS);
  assertRow(await measure(), `${tag} re-edit`);
  // Close and reopen in the same session.
  await page.evaluate(() => { disableNoteEditing(document.getElementById('modal-body')); contentModal.querySelector('.modal-close').click(); });
  await page.waitForFunction(() => !contentModal.classList.contains('visible'));
  await open();
  assertRow(await measure(), `${tag} reopen`);
  ok(errors.length === 0, `${tag}: no page errors ${errors.join(' | ')}`);
  await ctx.close();
}
for (const W of [390, 1280]) { await session(W, false); await session(W, true); }
await browser.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
