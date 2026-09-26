// Live DOM check for {#L<n>#} markers and code blocks (no Drive login). Run from repo root: node .bolter/check/markers-browser.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(path.join(root, p === '/' ? 'index.html' : p)); res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8767);
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
await page.goto('http://localhost:8767/index.html');
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
console.log('version', await page.evaluate(() => version));
const fmt = (...fs) => fs.map(f => JSON.stringify({ paramint: 0, paramfloat: 0, ...f })).join('|') + '|';
const body = () => page.evaluate(() => { const b = document.getElementById('modal-body'); return { text: b.innerText, html: b.innerHTML, code: b.querySelectorAll('.code-block').length, codeText: [...b.querySelectorAll('.code-block code')].map(c => c.textContent) }; });
const closeModal_ = () => page.evaluate(() => { const ta = document.getElementById('note-edit-textarea'); if (ta) ta.remove(); document.getElementById('content-modal').classList.remove('visible'); });

// 1. preview: code note with a stale span ending past the text -> real .code-block, no marker text
const CODE_NOTE = 'Note tanning app\n{{x}}';
await page.evaluate(([raw, format]) => showModal({ raw, format, id: 'mk-code' }), [CODE_NOTE, fmt({ start: 0, end: 4, type: 1 }, { start: 0, end: CODE_NOTE.length + 3, type: 2 })]);
let b = await body();
ok(b.code === 1 && b.codeText[0] === 'x', 'preview shows a .code-block with the code', b.codeText);
ok(!/CODE_BLOCK|\uE000/.test(b.text + b.html), 'preview has no code placeholder text');
ok(/<strong>Note<\/strong>/.test(b.html), 'preview keeps the valid bold span');
// 2. edit mode still shows the code
await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
await page.waitForSelector('#note-edit-textarea');
const taCode = await page.evaluate(() => document.getElementById('note-edit-textarea').value);
ok(taCode.includes('{{x}}'), 'edit mode textarea still contains the code', taCode);
await closeModal_();

// 3. preview of a note whose text carries {#L0#} / {#L1#}
const MEMO = 'my memo\nПровери линковете: GitHub: {#L0#} и viewer: {#L1#} **край**';
const s = MEMO.indexOf('край');
await page.evaluate(([raw, format]) => showModal({ raw, format, id: 'mk-memo' }), [MEMO, fmt({ start: s, end: s + 4, type: 1 })]);
b = await body();
ok(!b.text.includes('{#L') && !b.html.includes('{#L'), 'preview shows no {#L marker', b.text);
ok(b.text.includes('GitHub:') && b.text.includes('viewer:'), 'surrounding words intact');
ok(/<strong>край<\/strong>/.test(b.html), 'bold after the markers still on the same word', b.html);
// 4. edit mode keeps the marker visible (explicit requirement)
await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
await page.waitForSelector('#note-edit-textarea');
const taMemo = await page.evaluate(() => document.getElementById('note-edit-textarea').value);
ok(taMemo.includes('{#L0#}') && taMemo.includes('{#L1#}'), 'edit mode still shows the markers', taMemo);
await closeModal_();

// 5. cards (board preview) and hidden-note title
const card = await page.evaluate(async ([t1, f1]) => {
  const el = await createNoteElement({ notetxt: t1, text_span: f1, id: 'mk-card', color: 0 });
  document.body.appendChild(el); el.style.display = 'block';
  const hid = await createNoteElement({ notetxt: 'Скрита {#L0#} бележка|тайно', pass: true, id: 'mk-hidden', color: 0, title_span: '' });
  document.body.appendChild(hid); hid.style.display = 'block';
  const pipe = await createNoteElement({ notetxt: 'Заглавие {#L0#}|тяло {#L1#} {{k}}', id: 'mk-pipe', color: 0 });
  document.body.appendChild(pipe); pipe.style.display = 'block';
  return { card: el.textContent, hidden: hid.textContent, pipe: pipe.textContent, pipeCode: pipe.querySelectorAll('.code-block').length };
}, [MEMO, fmt({ start: s, end: s + 4, type: 1 })]);
ok(!card.card.includes('{#L') && card.card.includes('GitHub:'), 'card shows no marker', card.card);
ok(!card.hidden.includes('{#L'), 'hidden-note card shows no marker', card.hidden);
ok(!card.pipe.includes('{#L') && card.pipeCode === 1, 'title|body card: no marker, code rendered', card);

// 6. save path in the page: link in title + link in body, then an unrestorable marker -> toast
const save = await page.evaluate(() => {
  const title = 'Site https://a.example/x', bodyT = 'Doc https://b.example/y end';
  const slots = reserveLinkMarkerSlots(title + '\n' + bodyT);
  const tr = preEdit(title, [], -1, slots), br = preEdit(bodyT, [], -1, slots);
  const masked = JSON.parse(JSON.stringify(slots));
  const t = postEdit(tr.text, [], masked), bo = postEdit(br.text, [], masked);
  const bad = postEdit('a {#L0#} b', [], []);
  notifyRemovedLinkMarkers(bad.removedLinkMarkers);
  return { restored: t.text + '|' + bo.text, bad: bad.text, removed: bad.removedLinkMarkers, toast: document.getElementById('toastNotification').textContent };
});
ok(save.restored === 'Site https://a.example/x|Doc https://b.example/y end', 'title+body links restored in the page', save.restored);
ok(save.bad === 'a  b' && save.removed === 1 && /1/.test(save.toast) && save.toast.length > 10, 'unrestorable marker removed and toast shown', save);
// 7. real edit entry point: note with a link in the title and in the body -> dataset.maskedLinks + textareas
await page.evaluate(() => showModal({ raw: 'Site https://a.example/x|Doc https://b.example/y end', id: 'mk-links' }));
await page.evaluate(() => enableNoteEditing(document.getElementById('modal-body')));
await page.waitForSelector('#note-edit-textarea');
const real = await page.evaluate(() => {
  const mb = document.getElementById('modal-body');
  const masked = JSON.parse(mb.dataset.maskedLinks || '[]');
  const tA = document.getElementById('note-edit-title-textarea'), bA = document.getElementById('note-edit-textarea');
  return { masked, title: tA && tA.value, body: bA.value,
    saved: (tA ? postEdit(tA.value, [], masked).text + '|' : '') + postEdit(bA.value, [], masked).text };
});
ok(real.saved === 'Site https://a.example/x|Doc https://b.example/y end', 'enableNoteEditing -> postEdit restores both links', real);
await closeModal_();
ok(errors.length === 0, 'no page errors', errors);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
