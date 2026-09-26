// ▦ read-only table fields in place (b1.72), real browser on uni/. Run from repo root:
//   node .bolter/check/table-fields.mjs      (exit 1 on any failed assertion)
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js':'text/javascript', '.html':'text/html', '.json':'application/json', '.css':'text/css', '.webmanifest':'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(path.join(root, p === '/' ? 'index.html' : p)); res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8767);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://localhost:8767/index.html');
await page.waitForFunction(() => typeof version !== 'undefined' && version && typeof startApp === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 15000 });
errors.length = 0; // startup noise without Drive sign-in is not ours

const WIDE = '| Бележка | Собственик | Срок | Статус | Коментар |\n|-|-|-|-|-|\n| mul7236376_sergei | Cepreu | 12 окт | чака | API_TOKEN: проверка |';
const WIDE_A = '| Бележка           | Собственик | Срок   | Статус | Коментар            |\n| ----------------- | ---------- | ------ | ------ | ------------------- |\n| mul7236376_sergei | Cepreu     | 12 окт | чака   | API_TOKEN: проверка |';
const WIDE_C = '| Бележка | Собственик | Срок | Статус | Коментар |\n| - | - | - | - | - |\n| mul7236376_sergei | Cepreu | 12 окт | чака | API_TOKEN: проверка |';
const BEFORE = 'Текст над таблицата - нормален шрифт, дълъг ред, който се пренася на телефон.';
const AFTER = 'Текст под таблицата.\n\nОще един ред.';
const btn = page.locator('#content-modal .modal-edit-toolbar-btn.is-table');
const openNote = (raw, caretAt) => page.evaluate(([raw, caretAt]) => {
  showModal({ raw, id: 'fields-' + raw.length });
  enableNoteEditing(document.getElementById('modal-body'));
  const t = document.getElementById('note-edit-textarea'); t.focus();
  const i = t.value.indexOf(caretAt); t.setSelectionRange(i, i);
}, [raw, caretAt]);
const state = () => page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  const split = main.parentElement.querySelector(':scope > .note-table-split');
  const b = document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table');
  const fields = split ? [...split.querySelectorAll('.note-table-field')] : [];
  const texts = split ? [...split.querySelectorAll('.note-table-split-text')] : [];
  return {
    main: main.value, mainVisible: getComputedStyle(main).visibility === 'visible', mainFont: getComputedStyle(main).fontFamily,
    split: !!split, active: b.classList.contains('is-active'), pressed: b.getAttribute('aria-pressed'), tip: b.title,
    fields: fields.map(f => { const cs = getComputedStyle(f); return { text: f.textContent, ws: cs.whiteSpace, font: cs.fontFamily, ox: cs.overflowX,
      sw: f.scrollWidth, cw: f.clientWidth, h: f.offsetHeight, lh: parseFloat(cs.lineHeight), top: f.getBoundingClientRect().top, bottom: f.getBoundingClientRect().bottom }; }),
    texts: texts.map(t => ({ value: t.value, font: getComputedStyle(t).fontFamily, top: t.getBoundingClientRect().top, bottom: t.getBoundingClientRect().bottom, readOnly: t.readOnly })),
    format: document.getElementById('modal-body').dataset.format || '',
    splitH: split ? split.clientHeight : 0,
    active_el: document.activeElement?.className || document.activeElement?.id,
  };
});
const isMono = f => /mono|courier/i.test(f);

// 1. wide table between two texts, phone width
await openNote(BEFORE + '\n' + WIDE + '\n' + AFTER, 'Cepreu');
let s = await state();
ok(!s.split && !s.active && s.main === BEFORE + '\n' + WIDE + '\n' + AFTER && !isMono(s.mainFont), 'opened editor: no field, button off, normal font');
await page.screenshot({ path: '.bolter/check/fields-390-before.png' });
await btn.click(); // real click
s = await state();
ok(s.split && s.active && s.pressed === 'true', '1st press: field open, ▦ pressed');
ok(s.fields.length === 1 && s.fields[0].text === WIDE_A, '1st press: field shows the aligned table', s.fields[0]?.text);
ok(s.main === BEFORE + '\n' + WIDE_A + '\n' + AFTER && !s.mainVisible, '1st press: note text = before + aligned + after (byte for byte), note textarea hidden underneath');
ok(s.texts.length === 2 && s.texts[0].value === BEFORE && s.texts[1].value === AFTER, 'text before stays above, text after below, untouched', s.texts.map(t => t.value));
ok(s.texts[0].bottom <= s.fields[0].top && s.fields[0].bottom <= s.texts[1].top, 'field sits in the flow in place of the table');
ok(s.texts.every(t => !isMono(t.font) && t.font === s.mainFont), 'text around the table: normal modal font', s.texts.map(t => t.font));
const f = s.fields[0]; console.log('info', JSON.stringify({ field: f, splitH: s.splitH, texts: s.texts.map(t => [t.top, t.bottom]) }));
ok(f.ws === 'pre' && isMono(f.font) && (f.ox === 'auto' || f.ox === 'scroll'), 'field: white-space pre, monospace, overflow-x auto', f);
ok(f.sw > f.cw, 'field wider than the phone: scrolls sideways', { sw: f.sw, cw: f.cw });
ok(f.h < f.lh * 3 + 40, 'rows not wrapped: field is 3 lines high', { h: f.h, lh: f.lh });
const modalH = await page.evaluate(() => document.querySelector('#content-modal .modal-content-box').clientHeight);
ok(f.h <= modalH / 2 + 1, 'field height at most half the modal', { h: f.h, modalH });
ok(f.cw > 0 && await page.evaluate(() => { const el = document.querySelector('.note-table-field'); return el.scrollHeight <= el.clientHeight; }), 'all three rows visible without vertical scroll');
ok(/read-only|само за четене/.test(s.tip), 'tooltip describes the field', s.tip);
const scrolled = await page.evaluate(() => { const el = document.querySelector('.note-table-field'); el.scrollLeft = 120; return el.scrollLeft; });
ok(scrolled > 0, 'field scrolls horizontally', scrolled);
await page.screenshot({ path: '.bolter/check/fields-390-open.png' });
ok(await page.evaluate(() => document.querySelector('.note-table-field').isContentEditable === false && !document.querySelector('.note-table-field textarea')), 'field is read-only');

// editing in the text piece after the table goes through to the note
await page.evaluate(() => { const t = document.querySelectorAll('.note-table-split-text')[1]; t.focus(); t.setSelectionRange(0, 0); });
await page.keyboard.type('Ново ');
s = await state();
ok(s.main === BEFORE + '\n' + WIDE_A + '\nНово ' + AFTER && s.texts[1].value === 'Ново ' + AFTER, 'typing below the field edits the note in place');
// toolbar bold in the text piece above
await page.evaluate(() => { const t = document.querySelectorAll('.note-table-split-text')[0]; t.focus(); t.setSelectionRange(0, 5); });
await page.locator('#content-modal .modal-edit-toolbar-btn.is-bold').click();
s = await state();
ok(s.main.startsWith('**Текст** над') && s.texts[0].value.startsWith('**Текст**') && s.main.endsWith(WIDE_A + '\nНово ' + AFTER), 'B button works in the text piece');
await page.evaluate(() => { const t = document.querySelectorAll('.note-table-split-text')[0]; t.setRangeText('Текст', 0, 9, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); });
s = await state();
ok(s.main === BEFORE + '\n' + WIDE_A + '\nНово ' + AFTER, 'delete in the piece -> note back to before + table + after');

// 2nd press
await btn.click();
s = await state();
ok(!s.split && !s.active && s.pressed === 'false' && s.mainVisible, '2nd press: fields closed, ▦ off, note textarea visible');
ok(s.main === BEFORE + '\n' + WIDE_C + '\nНово ' + AFTER, '2nd press: table compact, text around it untouched', s.main);
ok(!isMono(s.mainFont), '2nd press: normal font');
await page.screenshot({ path: '.bolter/check/fields-390-closed.png' });

// 3. Ctrl+click: all tables, each with a field in its place
const T2 = '| A | B |\n|-|-|\n| долъг текст | 1 |';
await openNote('Горе\n' + WIDE + '\nСреда\n' + T2 + '\nДолу', 'Горе');
await btn.click({ modifiers: ['Control'] });
s = await state();
ok(s.fields.length === 2 && JSON.stringify(s.texts.map(t => t.value)) === JSON.stringify(['Горе', 'Среда', 'Долу']), 'Ctrl+click: a field for each table, texts in between', s.texts.map(t => t.value));
ok(s.fields[0].bottom <= s.texts[1].top && s.texts[1].bottom <= s.fields[1].top, 'Ctrl+click: fields in document order');
await btn.click();
s = await state();
ok(!s.split && s.main === 'Горе\n' + WIDE_C + '\nСреда\n| A | B |\n| - | - |\n| долъг текст | 1 |\nДолу', 'Ctrl+click then press: all compact');
// plain click: only the table under the caret
await openNote('Горе\n' + WIDE + '\nСреда\n' + T2 + '\nДолу', 'долъг');
await btn.click();
s = await state();
ok(s.fields.length === 1 && s.fields[0].text === '| A           | B |\n| ----------- | - |\n| долъг текст | 1 |' && s.main.startsWith('Горе\n' + WIDE + '\n'), 'plain click: only the table under the caret');
await btn.click();

// 4. no table: nothing
await openNote('Без таблица\nсамо текст | с черта', 'само');
const plain = (await state()).main;
await btn.click(); await btn.click({ modifiers: ['Control'] });
s = await state();
ok(!s.split && !s.active && s.main === plain, 'no table: nothing changes');

// 4b. stored format ranges (dataset.format) follow edits made in a text piece; backdrops show them
await openNote(BEFORE + '\n' + WIDE + '\n' + AFTER, 'Cepreu');
await btn.click();
const fmt = await page.evaluate(() => {
  const main = document.getElementById('note-edit-textarea');
  const at = main.value.indexOf('Още');
  document.getElementById('modal-body').dataset.format = JSON.stringify({ start: at, end: at + 3, type: 4 });
  const t = document.querySelectorAll('.note-table-split-text')[0];
  t.focus(); t.setSelectionRange(0, 0);
  return at;
});
await page.keyboard.type('АБ');
const f2 = await page.evaluate(() => ({ fmt: JSON.parse(document.getElementById('modal-body').dataset.format), main: document.getElementById('note-edit-textarea').value,
  marked: [...document.querySelectorAll('.note-table-split-backdrop span')].map(x => x.textContent) }));
ok(f2.fmt.start === fmt + 2 && f2.main.slice(f2.fmt.start, f2.fmt.end) === 'Още' && JSON.stringify(f2.marked) === '["Още"]', 'format range shifts with typing above the table and is drawn in the piece below', f2);
await btn.click();
const f3 = await page.evaluate(() => ({ fmt: JSON.parse(document.getElementById('modal-body').dataset.format), main: document.getElementById('note-edit-textarea').value }));
ok(f3.main.slice(f3.fmt.start, f3.fmt.end) === 'Още' && f3.main === 'АБ' + BEFORE + '\n' + WIDE_C + '\n' + AFTER, 'format range still on the same text after closing + compact', f3);

// 5. preview + save paths with fields open read the whole note
await openNote(BEFORE + '\n' + WIDE + '\n' + AFTER, 'Cepreu');
await btn.click();
await page.evaluate(() => previewEditedNote());
const prev = await page.evaluate(() => ({ html: document.getElementById('modal-body').innerText, ta: !!document.getElementById('note-edit-textarea') }));
ok(!prev.ta && prev.html.includes('Текст над таблицата') && prev.html.includes('Още един ред') && prev.html.includes('mul7236376_sergei'), 'preview with fields open shows the whole note');

// 6. desktop width
await page.setViewportSize({ width: 1280, height: 800 });
await page.evaluate(() => { localStorage.setItem('modalWidth', '720px'); localStorage.setItem('modalHeight', '560px'); });
await openNote(BEFORE + '\n' + WIDE + '\n' + AFTER, 'Cepreu');
await page.screenshot({ path: '.bolter/check/fields-1280-before.png' });
await btn.click();
s = await state();
ok(s.fields.length === 1 && s.fields[0].text === WIDE_A && s.texts.length === 2 && s.texts[0].bottom <= s.fields[0].top && s.fields[0].bottom <= s.texts[1].top, '1280: field open in place');
await page.screenshot({ path: '.bolter/check/fields-1280-open.png' });
await btn.click();
s = await state();
ok(!s.split && s.main === BEFORE + '\n' + WIDE_C + '\n' + AFTER, '1280: second press closes and compacts');
await page.screenshot({ path: '.bolter/check/fields-1280-closed.png' });

ok(errors.length === 0, 'no page errors', errors);
console.log(`${n - fails}/${n} passed`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
