// Plan 9 (b1.74): the edit modal opens with every table already aligned in its field, real browser on uni/.
//   node .bolter/check/auto-align.mjs      (exit 1 on any failed assertion)
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve(process.env.ROOT || 'uni'); // ROOT=<old uni/>: only the 'before' shots
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

// The plan's example table as Cepreu writes it: no outer |, short-ish separator.
const TABLE = '|Col1 header| Col 2|Col 3\n|-|-|-|\nText 1|Test|note 1\nnote 2|Text 2|Test';
const ALIGNED = '| Col1 header | Col 2  | Col 3  |\n| ----------- | ------ | ------ |\n| Text 1      | Test   | note 1 |\n| note 2      | Text 2 | Test   |';
const COMPACT = '| Col1 header | Col 2 | Col 3 |\n| - | - | - |\n| Text 1 | Test | note 1 |\n| note 2 | Text 2 | Test |';
const BEFORE = 'Днес минахме през трите неща: https://a.example/x';
const AFTER = 'Останалото - утре. {{код | с черта}}';
const BEFORE_E = 'Днес минахме през трите неща: {#L0#}'; // the link is masked while editing, Save puts it back
const NOTE = 'Работна среща - бележки|' + BEFORE + '\n' + TABLE + '\n' + AFTER;
const T2 = '| A | B |\n|-|-|\n| долъг текст | 1 |';
const T2A = '| A           | B |\n| ----------- | - |\n| долъг текст | 1 |';
const btn = page.locator('#content-modal .modal-edit-toolbar-btn.is-table');
let seq = 0;
// Opens the note as the user does: the note modal is shown, and once it is on screen (a hidden modal
// cannot take focus) the editor is opened with enableNoteEditing. Nothing is pressed afterwards.
const openNote = async (raw, charIndex = -1) => {
  await page.evaluate(([raw, id]) => {
    allNotesData.push({ id, gdid: 'test-' + id, notetxt: raw, text_span: '', title_span: '', color: 0, boardid: currentBoardFilter, datemod: 1, version: 1 });
    showModal({ raw, id });
    const body = document.getElementById('modal-body');
    body.dataset.id = id; body.dataset.gdid = 'test-' + id;
  }, [raw, 900000 + (++seq)]);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#content-modal .modal-content-box')).visibility === 'visible');
  await page.evaluate(charIndex => enableNoteEditing(document.getElementById('modal-body'), charIndex), charIndex);
};
const state = () => page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  const title = document.getElementById('note-edit-title-textarea');
  const split = main.parentElement.querySelector(':scope > .note-table-split');
  const b = document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table');
  const fields = split ? [...split.querySelectorAll('.note-table-field')] : [];
  const texts = split ? [...split.querySelectorAll('.note-table-split-text')] : [];
  const a = document.activeElement;
  return {
    main: main.value, title: title ? title.value : null, mainVisible: getComputedStyle(main).visibility === 'visible',
    split: !!split, splits: main.parentElement.querySelectorAll(':scope > .note-table-split').length,
    active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'),
    fields: fields.map(f => ({ text: f.value, font: getComputedStyle(f).fontFamily, top: f.getBoundingClientRect().top, bottom: f.getBoundingClientRect().bottom })),
    texts: texts.map(t => ({ value: t.value, top: t.getBoundingClientRect().top, bottom: t.getBoundingClientRect().bottom })),
    focus: a === title ? 'title' : a === main ? 'main' : a?.classList.contains('note-table-field') ? 'field' : a?.classList.contains('note-table-split-text') ? 'text' : (a?.id || a?.tagName),
    focusIdx: fields.indexOf(a) >= 0 ? fields.indexOf(a) : texts.indexOf(a), caret: a?.selectionStart, focusLen: a?.value?.length,
  };
});
const isMono = f => /mono|courier/i.test(f);
// Screenshots wait for the modal's fade-in to end (read from the page, no fixed sleep).
const shot = async file => {
  await page.waitForFunction(() => [document.getElementById('content-modal'), document.querySelector('#content-modal .modal-content-box')]
    .every(el => el && el.getAnimations({ subtree: false }).every(a => a.playState !== 'running') && getComputedStyle(el).opacity === '1'), null, { timeout: 5000 }).catch(() => console.log('info fade not settled for', file));
  await page.screenshot({ path: file });
};
const sizeModal = width => page.evaluate(w => { localStorage.setItem('modalWidth', w === 390 ? '370px' : '720px'); localStorage.setItem('modalHeight', w === 390 ? '600px' : '560px'); }, width);
const closeModal = () => page.evaluate(() => { disableNoteEditing(document.getElementById('modal-body')); document.getElementById('content-modal').classList.remove('visible'); });

if (process.env.ROOT && !process.env.FULL) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await sizeModal(width);
    await openNote(NOTE);
    await shot(`.bolter/check/auto-${width}-before.png`);
    await closeModal();
  }
  await browser.close(); srv.close(); process.exit(0);
}

for (const width of [390, 1280]) {
  await page.setViewportSize({ width, height: 800 });
  await sizeModal(width);
  const W = width + ': ';

  // (a) opens already aligned, nothing pressed
  await openNote(NOTE);
  let s = await state();
  ok(s.split && s.splits === 1 && s.active && s.pressed === 'true', W + '(a) opened: table field open, ▦ pressed, nothing clicked');
  ok(s.fields.length === 1 && s.fields[0].text === ALIGNED && isMono(s.fields[0].font), W + '(a) field shows the aligned + repaired table in monospace', s.fields[0]?.text);
  ok(s.main === BEFORE_E + '\n' + ALIGNED + '\n' + AFTER && !s.mainVisible, W + '(a) note text = before + aligned table + after (what Save reads)', s.main);
  ok(s.texts.length === 2 && s.texts[0].value === BEFORE_E && s.texts[1].value === AFTER && s.texts[0].bottom <= s.fields[0].top && s.fields[0].bottom <= s.texts[1].top, W + '(a) text above / field / text below in place');
  // (g) focus: title field (the note has a title), caret at its end - not in the table field
  ok(s.focus === 'title' && s.caret === s.focusLen, W + '(г) focus in the title, caret at its end', { focus: s.focus, caret: s.caret });
  await shot(`.bolter/check/auto-${width}-opened.png`);

  // (b) next press of ▦ compacts
  await btn.click();
  s = await state();
  ok(!s.split && !s.active && s.pressed === 'false' && s.mainVisible && s.main === BEFORE_E + '\n' + COMPACT + '\n' + AFTER, W + '(b) one press: fields closed, compact table, text around untouched', s.main);
  await shot(`.bolter/check/auto-${width}-pressed.png`);
  await btn.click();
  s = await state();
  ok(s.split && s.fields[0]?.text === ALIGNED, W + '(b) second press: aligned field again');
  await closeModal();

  // (c) note without a table: opens as before, ▦ off
  const PLAIN = 'Без таблица\nсамо текст - с тире\nи още ред';
  await openNote(PLAIN);
  s = await state();
  ok(!s.split && !s.active && s.pressed === 'false' && s.mainVisible && s.main === PLAIN && s.focus === 'main' && s.caret === PLAIN.length, W + '(в) no table: plain textarea, text unchanged, ▦ off, caret at end', s);
  await btn.click();
  s = await state();
  ok(!s.split && !s.active && s.main === PLAIN, W + '(в) no table: ▦ does nothing');
  if (width === 390) await shot('.bolter/check/auto-390-plain.png');
  await closeModal();

  // several tables, no title: all aligned, focus in the text piece after the last table
  const MULTI = 'Горе\n' + TABLE + '\nСреда\n' + T2 + '\nДолу';
  await openNote(MULTI);
  s = await state();
  ok(s.fields.length === 2 && s.fields[0].text === ALIGNED && s.fields[1].text === T2A && s.main === 'Горе\n' + ALIGNED + '\nСреда\n' + T2A + '\nДолу', W + 'several tables: all aligned, each in its field');
  ok(s.focus === 'text' && s.focusIdx === 2 && s.caret === 'Долу'.length, W + '(г) no title: focus in the last text piece, caret at the end', s);

  // (e) Ctrl+Z undoes only what was typed, not the auto-alignment
  await page.keyboard.type(' ново');
  s = await state();
  ok(s.main.endsWith('\nДолу ново'), W + '(д) typing goes into the note');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+z'); // more than was typed
  s = await state();
  ok(s.main === 'Горе\n' + ALIGNED + '\nСреда\n' + T2A + '\nДолу' && s.split && s.fields[0].text === ALIGNED, W + '(д) Ctrl+Z x12: typed text gone, tables still aligned', s.main);
  await closeModal();

  // note ending with a table, no title: focus in the text above it, not in the field
  await openNote('Горе\n' + TABLE);
  s = await state();
  ok(s.split && s.focus === 'text' && s.caret === 'Горе'.length, W + '(г) table last: focus stays in the text, not in the field', s);
  await closeModal();

  // opened from search inside the table: caret stays at the found text, in the table field
  const SRCH = 'Горе\n' + TABLE + '\nДолу';
  await openNote(SRCH, SRCH.indexOf('Text 2'));
  s = await state();
  ok(s.split && s.focus === 'field' && s.fields[0].text.slice(s.caret, s.caret + 7).trim().startsWith('Text 2'), W + 'search hit in a table: caret on the found text in the field', s);
  await closeModal();
  // opened from search below the table
  await openNote(SRCH, SRCH.indexOf('Долу') + 2);
  s = await state();
  ok(s.split && s.focus === 'text' && s.focusIdx === 1 && s.caret === 2, W + 'search hit below the table: caret there in the text', s);
  await closeModal();

  // already open fields are not opened twice
  await openNote(NOTE);
  await page.evaluate(() => openNoteTableFieldsOnEdit(document.getElementById('note-edit-textarea'), 0));
  s = await state();
  ok(s.splits === 1 && s.fields.length === 1 && s.main === BEFORE_E + '\n' + ALIGNED + '\n' + AFTER, W + 'second call does not open the fields again');
  await closeModal();
}

ok(errors.length === 0, 'no page errors while editing', errors);
// Save: open + Save without touching the table -> the aligned table is written, no markers, cells word for word
await page.evaluate(() => localStorage.setItem('closeAfterSave', 'false'));
await openNote(NOTE);
const saveId = 900000 + seq;
errors.length = 0;
await page.evaluate(() => saveEditedNote());
await page.waitForFunction(id => allNotesData.find(n => n.id === id)?.notetxt !== undefined && allNotesData.find(n => n.id === id).version > 1, saveId, { timeout: 5000 }).catch(() => {});
const saved = await page.evaluate(id => allNotesData.find(n => n.id === id).notetxt, saveId);
ok(saved === 'Работна среща - бележки|' + BEFORE + '\n' + ALIGNED + '\n' + AFTER, 'Save: the aligned table is written as it stands in the editor', saved);
ok(!/\{#L\d+#\}|%%?CODE_BLOCK%%?|/.test(saved), 'Save: no {#L#} / CODE_BLOCK markers', saved);
const words = t => t.split(/[\s|\-]+/).filter(Boolean);
ok(JSON.stringify(words(saved)) === JSON.stringify(words(NOTE)), 'Save: every word kept, in order');

const saveErrors = errors.filter(e => !/gapi is not defined|Access token not available/.test(e)); // no Drive session in the test browser
ok(saveErrors.length === 0, 'no page errors on save (besides the missing Drive sign-in)', saveErrors);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
