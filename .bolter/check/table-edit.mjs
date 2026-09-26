// ▦ editable table field (b1.73), real browser on uni/. Run from repo root:
//   node .bolter/check/table-edit.mjs      (exit 1 on any failed assertion)
// Open the note with Cepreu's example table, press ▦, type in the field, press ▦ again, preview:
// what was typed is in the note; the 2nd press only removes padding/dashes (Variant A).
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(path.join(root, p === '/' ? 'index.html' : p)); res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8768);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://localhost:8768/index.html');
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
errors.length = 0; // startup noise without Drive sign-in is not ours

// Cepreu's example table (plan mockup), in its original unaligned form.
const CS = '|Col1 header| Col 2|Col 3\n|-|-|-|\nText 1|Test|note 1\nnote 2|Text 2|Test';
const MOCK = '| Col1 header | Col 2  | Col 3  |\n| ----------- | ------ | ------ |\n| Text 1      | Test   | note 1 |\n| note 2      | Text 2 | Test   |';
const BEFORE = 'Текст преди таблицата';
const AFTER = 'Текст след таблицата';
const NOTE = BEFORE + '\n' + CS + '\n' + AFTER;
// Typed in the field: ' ново' after 'note 1' (alignment broken), a new row after the last one.
const TYPED_TABLE = '| Col1 header | Col 2  | Col 3  |\n| ----------- | ------ | ------ |\n| Text 1      | Test   | note 1 ново |\n| note 2      | Text 2 | Test   |\n| нов ред | x |';
const CLOSED = BEFORE + '\n| Col1 header | Col 2 | Col 3 |\n| - | - | - |\n| Text 1 | Test | note 1 ново |\n| note 2 | Text 2 | Test |\n| нов ред | x |\n' + AFTER;

const btn = page.locator('#content-modal .modal-edit-toolbar-btn.is-table');
const openNote = (raw, caretAt) => page.evaluate(([raw, caretAt]) => {
  showModal({ raw, id: 'edit-' + raw.length + '-' + Math.random() });
  enableNoteEditing(document.getElementById('modal-body'));
  const t = document.getElementById('note-edit-textarea');
  // b1.74 opens with the tables aligned in fields; these checks start from the pre-b1.74 editor (text as written).
  if (getNoteTableSplit(t)) { closeNoteTableSplit(t); t.value = t.dataset.lastVal = document.getElementById('modal-body').dataset.initialEditText; updateTableAlignButtonState(); }
  t.focus();
  const i = t.value.indexOf(caretAt); t.setSelectionRange(i, i);
}, [raw, caretAt]);
const state = () => page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  const split = main?.parentElement.querySelector(':scope > .note-table-split');
  const f = split?.querySelector('.note-table-field');
  const cs = f && getComputedStyle(f);
  return {
    main: main?.value, split: !!split, mainVisible: main && getComputedStyle(main).visibility === 'visible',
    field: f && { tag: f.tagName, value: f.value, readOnly: f.readOnly, ws: cs.whiteSpace, font: cs.fontFamily, sw: f.scrollWidth, cw: f.clientWidth, sh: f.scrollHeight, ch: f.clientHeight, h: f.offsetHeight },
    texts: split ? [...split.querySelectorAll('.note-table-split-text')].map(t => t.value) : [],
    active: document.activeElement?.className || document.activeElement?.id,
  };
});
const caretInField = (at, offset = 0) => page.evaluate(([at, offset]) => {
  const f = document.querySelector('.note-table-field'); f.focus();
  const i = at === -1 ? f.value.length : f.value.indexOf(at) + offset; f.setSelectionRange(i, i);
}, [at, offset]);

for (const [w, h] of [[390, 800], [1280, 800]]) {
  await page.setViewportSize({ width: w, height: h });
  if (w === 1280) await page.evaluate(() => { localStorage.setItem('modalWidth', '720px'); localStorage.setItem('modalHeight', '560px'); });
  await openNote(NOTE, 'Test');
  let s = await state();
  ok(!s.split && s.main === NOTE, `${w}: editor open, no field`);
  await page.screenshot({ path: `.bolter/check/edit-${w}-before.png` });
  await btn.click();
  s = await state();
  ok(s.split && s.field?.tag === 'TEXTAREA' && !s.field.readOnly && s.field.value === MOCK, `${w}: 1st press -> editable textarea with the aligned table`, s.field);
  ok(s.field.ws === 'pre' && /mono|courier/i.test(s.field.font), `${w}: field monospace, no wrapping`, s.field);
  // a real click into the field puts the caret there
  await page.locator('.note-table-field').click({ position: { x: 20, y: 10 } });
  ok((await state()).active === 'note-table-field', `${w}: real click focuses the field`);
  // type after 'note 1'
  await caretInField('note 1', 6);
  await page.keyboard.type(' ново');
  s = await state();
  ok(s.field.value.includes('| note 1 ново |') && s.main === BEFORE + '\n' + s.field.value + '\n' + AFTER, `${w}: typed letters are in the note at once`, s.main);
  // Enter at the end adds a new line inside the field (does not close it)
  await caretInField(-1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('| нов ред | x |');
  s = await state();
  ok(s.split && s.field.value === TYPED_TABLE && s.main === BEFORE + '\n' + TYPED_TABLE + '\n' + AFTER, `${w}: Enter = new row in the field, note updated, no re-alignment while typing`, s.field.value);
  // (sideways scroll of a wider-than-phone field is checked in table-fields.mjs on the textarea)
  ok(s.field.sh <= s.field.ch + 1, `${w}: field grew to show all 5 rows`, s.field);
  ok(JSON.stringify(s.texts) === JSON.stringify([BEFORE, AFTER]), `${w}: text around the field untouched`, s.texts);
  // Ctrl+Z in the field undoes through to the note
  await page.keyboard.type('Z');
  await page.keyboard.press('Control+z');
  s = await state();
  ok(s.field.value === TYPED_TABLE && s.main === BEFORE + '\n' + TYPED_TABLE + '\n' + AFTER, `${w}: Ctrl+Z undoes in the field and the note`, s.field.value.slice(-20));
  await page.screenshot({ path: `.bolter/check/edit-${w}-typing.png` });
  // Tab leaves the field for the next part of the note
  await page.keyboard.press('Tab');
  s = await state();
  ok(s.split && s.active === 'note-table-split-text' && s.field.value === TYPED_TABLE, `${w}: Tab moves on to the text after, field unchanged`, s.active);
  // 2nd press: Variant A
  await btn.click();
  s = await state();
  ok(!s.split && s.mainVisible && s.main === CLOSED, `${w}: 2nd press -> compact, typed text word for word, no re-alignment`, s.main);
  await page.screenshot({ path: `.bolter/check/edit-${w}-closed.png` });
  await page.evaluate(() => previewEditedNote());
  const prev = await page.evaluate(() => ({ text: document.getElementById('modal-body').innerText, cells: [...document.querySelectorAll('#modal-body td, #modal-body th')].map(c => c.textContent.trim()) }));
  ok(prev.cells.includes('note 1 ново') && prev.cells.includes('нов ред') && prev.text.includes(AFTER), `${w}: preview shows what was typed`, prev.cells);
  await page.screenshot({ path: `.bolter/check/edit-${w}-preview.png` });
}

// typed in the field, then preview straight away with the field open: nothing lost
await openNote(NOTE, 'Test');
await btn.click();
await caretInField('Text 2', 6);
await page.keyboard.type('!');
await page.evaluate(() => previewEditedNote());
let cells = await page.evaluate(() => [...document.querySelectorAll('#modal-body td')].map(c => c.textContent.trim()));
ok(cells.includes('Text 2!'), 'preview with the field still open keeps what was typed', cells);

// another action changes the note inside the table while the field is open: carried into the field
await openNote(NOTE, 'Test');
await btn.click();
let r = await page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  const i = main.value.indexOf('note 2') + 6;
  main.value = main.value.slice(0, i) + 'Л' + main.value.slice(i); main.setSelectionRange(i + 1, i + 1);
  main.dispatchEvent(new Event('input', { bubbles: true }));
  const f = document.querySelector('.note-table-field');
  return { open: !!f, field: f?.value, main: main.value };
});
ok(r.open && r.field.includes('| note 2Л ') && r.main.includes(r.field), 'outside edit inside the table is carried into the open field', r);
// an edit spanning text and table closes the fields, the typed text stays
await caretInField('Text 1', 0);
await page.keyboard.type('Я');
r = await page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  main.value = main.value.replace('таблицата\n|', 'таблицата |'); main.dispatchEvent(new Event('input', { bubbles: true }));
  return { open: !!document.querySelector('.note-table-field'), main: main.value };
});
ok(!r.open && r.main.includes('ЯText 1') && r.main.includes('note 2Л'), 'edit across pieces closes the field, typed text kept', r);

ok(errors.length === 0, 'no page errors', errors);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
