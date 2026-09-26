const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../uni/main.js', 'utf8');
const a = src.indexOf('// --- Markdown table alignment'), b = src.indexOf('// --- end markdown table alignment');
const api = new Function(src.slice(a, b) + '; return { collectAlignableMarkdownTables, selectMarkdownTablesForAlignment, toggleMarkdownTablesAlignment, areAllMarkdownTablesAligned, findMarkdownTableAtOffset, planMarkdownTableFieldsOpen, planMarkdownTableFieldsClose, splitNoteAtTableRanges, joinNotePieces };')();
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const run = (text, caret, all) => api.toggleMarkdownTablesAlignment(text, api.selectMarkdownTablesForAlignment(text, caret, all)).text;
const t1 = '| Field | Type |\n| - | - |\n| status | string |\n| id | number |';
const t2 = '| Ключ | Стойност |\n| - | - |\n| a | 1 |';
const note = 'intro\n' + t1 + '\nтекст между тях\n' + t2 + '\nend';
const caret1 = note.indexOf('status') + 6;
const r1 = run(note, caret1, false);
ok(r1 !== note && r1.includes('| ------ | ------ |'), 'click in table 1 aligns table 1');
ok(r1.endsWith('\nтекст между тях\n' + t2 + '\nend') && r1.startsWith('intro\n'), 'table 2 byte-identical after click in table 1');
const caret2 = note.indexOf('Стойност');
const r2 = run(note, caret2, false);
ok(r2.startsWith('intro\n' + t1 + '\n') && r2 !== note, 'click in table 2 leaves table 1 identical');
const rAll = run(note, caret1, true);
ok(rAll.includes('| ------ | ------ |') && rAll.includes('| ---- | -------- |'), 'all path aligns both');
console.log(rAll);
ok(run(rAll, rAll.indexOf('status'), false) === 'intro\n' + t1 + '\nтекст между тях\n' + rAll.split('\nтекст между тях\n')[1], 'second click in aligned table 1 compacts only it');
ok(run(rAll, 0, true) === note, 'all path on all-aligned compacts all');
const one = t1;
const aligned1 = run(one, 3, false);
ok(aligned1 !== one && run(aligned1, 3, false) === one, 'aligned single table comes back compact');
ok(run(one, one.length, false) === aligned1, 'caret at end of last row counts as inside');
ok(run('x\n' + one, 0, false) === 'x\n' + aligned1, 'caret outside, one table -> aligns it');
const outside = run(note, 0, false);
ok(outside === rAll, 'caret outside, several tables -> aligns all');
const braces = '{{\n| A | B |\n| - | - |\n| 1 | 2 |\n}}';
ok(run(braces, 5, false) === braces && run(braces, 5, true) === braces, '{{...}} table untouched');
const fence = '```\n| A | B |\n| - | - |\n| 1 | 2 |\n```';
ok(run(fence, 6, false) === fence && run(fence, 6, true) === fence, 'fenced table untouched');
const esc = '| A \\| x | B |\n| - | - |\n| 1 | 2 |';
ok(run(esc, 2, false) === esc && run(esc, 2, true) === esc, 'escaped \\| text untouched');
ok(run('no tables here', 3, false) === 'no tables here' && run('', 0, true) === '', 'no table -> nothing');
// button state: under caret vs all
ok(api.areAllMarkdownTablesAligned(r1, [api.findMarkdownTableAtOffset(api.collectAlignableMarkdownTables(r1), r1.indexOf('status'))]) === true, 'state: aligned table under caret -> active');
ok(api.areAllMarkdownTablesAligned(r1) === false, 'state: not all aligned -> inactive for whole note');
// --- tables without outer | (Variant 2: aligned form adds the missing |) ---
const cs = '|Col1 header| Col 2|Col 3\n|-|-|-|\nText 1|Test|note 1\nnote 2|Text 2|Test';
const mock = '| Col1 header | Col 2  | Col 3  |\n| ----------- | ------ | ------ |\n| Text 1      | Test   | note 1 |\n| note 2      | Text 2 | Test   |';
const dense = '| Col1 header | Col 2 | Col 3 |\n| - | - | - |\n| Text 1 | Test | note 1 |\n| note 2 | Text 2 | Test |';
const csA = run(cs, 0, false);
ok(csA === mock, 'Cepreu table: one press -> mockup');
if (csA !== mock) console.log(csA);
ok(run(csA, 0, false) === dense, 'Cepreu table: second press -> dense form');
ok(api.areAllMarkdownTablesAligned(csA) && api.toggleMarkdownTablesAlignment(csA).aligned === false, 'Cepreu table: aligned -> no more aligned edits');
ok(run(dense, 0, false) === mock, 'dense form aligns back to mockup');
const trailOnly = '| A | B |\n| - | - |\nx | y |\n| long | z |';
ok(run(trailOnly, 0, false) === '| A    | B |\n| ---- | - |\n| x    | y |\n| long | z |', 'row with only trailing |');
const leadOnly = 'A | B\n- | -\n| x | yy';
ok(run(leadOnly, 0, false) === '| A | B  |\n| - | -- |\n| x | yy |', 'no outer | at all + lead-only row');
const mixed = 'pre\n| Name | Age |\n|---|---|\nAnn | 3\n| Bob | 40 |\nCy|5|\npost';
const mixedA = run(mixed, 6, false);
ok(mixedA === 'pre\n| Name | Age |\n| ---- | --- |\n| Ann  | 3   |\n| Bob  | 40  |\n| Cy   | 5   |\npost', 'mixed rows');
ok(run(mixedA, 6, false) === 'pre\n| Name | Age |\n| - | - |\n| Ann | 3 |\n| Bob | 40 |\n| Cy | 5 |\npost', 'mixed rows: second press dense');
const crlf = cs.replace(/\n/g, '\r\n');
const crlfA = run(crlf, 0, false);
ok(crlfA === mock.replace(/\n/g, '\r\n'), 'CRLF: aligned, \\r kept at line ends');
ok(run(crlfA, 0, false) === dense.replace(/\n/g, '\r\n'), 'CRLF: second press dense');
const bl = '%%|Key|Val\n-|-|-\n|a|1|\nbb|22';
const blA = run(bl, 0, false);
ok(blA === '| %% | Key | Val |\n| -- | --- | --- |\n| a  | 1   |     |\n| bb | 22  |     |'.replace('|     |\n| bb | 22  |     |', '|\n| bb | 22  |'), 'borderless %% without outer |');
if (!blA.startsWith('| %% |')) console.log(blA);
ok(run(blA, 0, false) === '|%%| Key | Val |\n| - | - | - |\n| a | 1 |\n| bb | 22 |', 'borderless: second press compact, marker tight');
const multi = 'intro\n' + t1 + '\nмежду\n' + bl + '\nи\n' + cs + '\nend';
const multiA = run(multi, 0, true);
ok(multiA === 'intro\n' + aligned1 + '\nмежду\n' + blA + '\nи\n' + mock + '\nend', 'hold (all=true): three tables incl. borderless and open rows');
ok(api.collectAlignableMarkdownTables(multiA).every(t => api.toggleMarkdownTablesAlignment(multiA, [t]).aligned === false) && api.areAllMarkdownTablesAligned(multiA), 'after hold: getMarkdownTableEdits aligned is empty everywhere');
ok(run(multiA, 0, true) === 'intro\n' + t1 + '\nмежду\n' + run(blA, 0, false) + '\nи\n' + dense + '\nend', 'hold again: all compact');
const openEsc = 'A \\| x | B\n- | -\n1 | 2';
ok(run(openEsc, 0, true) === openEsc, 'open row with escaped \\| untouched');
const openTick = '`a|b` | B\n- | -\n1 | 2';
ok(run(openTick, 0, true) === openTick, 'open row with | inside backticks untouched');
ok(run('a | b\nc | d', 0, true) === 'a | b\nc | d', 'no separator row -> nothing');
// --- ▦ opens read-only table fields in place (b1.72) ---
const open = (text, caret, all) => api.planMarkdownTableFieldsOpen(text, caret, all);
const texts = (pieces) => pieces.filter(p => p.kind === 'text').map(p => p.value);
const tablesIn = (pieces) => pieces.filter(p => p.kind === 'table').map(p => p.value);
{
  const before = 'Над таблицата **текст** {#L1#}\nвтори ред';
  const after = 'Под таблицата\n\nпоследен ред';
  const note = before + '\n' + cs + '\n' + after;
  const o = open(note, note.indexOf('Test'), false);
  const pieces = api.splitNoteAtTableRanges(o.text, o.ranges);
  ok(o.tableCount === 1 && o.text === before + '\n' + mock + '\n' + after, 'fields: first press aligns the table, text around it byte-identical');
  ok(api.joinNotePieces(pieces) === o.text, 'fields: pieces join back to the note byte for byte');
  ok(JSON.stringify(texts(pieces)) === JSON.stringify([before, after]) && JSON.stringify(tablesIn(pieces)) === JSON.stringify([mock]), 'fields: text before / aligned table in field / text after');
  const c = api.planMarkdownTableFieldsClose(o.text, o.ranges);
  ok(c.text === before + '\n' + dense + '\n' + after, 'fields: second press -> compact table, text around it byte-identical');
  const oa = open(before + '\n' + mock + '\n' + after, 0, false);
  ok(oa.edits.length === 0 && oa.tableCount === 1, 'fields: already aligned table still gets a field');
}
{
  const o = open(multi, multi.indexOf('status'), false);
  ok(o.tableCount === 1 && o.text === 'intro\n' + aligned1 + '\nмежду\n' + bl + '\nи\n' + cs + '\nend', 'fields: plain click -> only the table under the caret');
  const oa = open(multi, 0, true);
  const pieces = api.splitNoteAtTableRanges(oa.text, oa.ranges);
  ok(oa.tableCount === 3 && oa.text === multiA, 'fields: hold -> all three tables aligned');
  ok(JSON.stringify(texts(pieces)) === JSON.stringify(['intro', 'между', 'и', 'end']) && JSON.stringify(tablesIn(pieces)) === JSON.stringify([aligned1, blA, mock]), 'fields: hold -> a field in place of each table');
  ok(api.joinNotePieces(pieces) === multiA, 'fields: hold -> pieces join back byte for byte');
  ok(api.planMarkdownTableFieldsClose(oa.text, oa.ranges).text === run(multiA, 0, true), 'fields: hold, second press -> all compact');
}
{
  const edge = [mock, mock + '\n', '\n' + mock, 'a\n\n' + mock + '\n\nb', 'x\r\n' + mock];
  edge.forEach(t => {
    const o = open(t, t.indexOf('|'), false);
    ok(o.tableCount === 1 && api.joinNotePieces(api.splitNoteAtTableRanges(o.text, o.ranges)) === o.text, 'fields: edge join ' + JSON.stringify(t.slice(0, 6)));
  });
  ok(JSON.stringify(texts(api.splitNoteAtTableRanges(mock, [{ start: 0, end: mock.length }]))) === '[]', 'fields: table alone -> no text piece');
  ok(JSON.stringify(texts(api.splitNoteAtTableRanges('a\n\n' + mock + '\n\nb', [{ start: 3, end: 3 + mock.length }]))) === JSON.stringify(['a\n', '\nb']), 'fields: blank lines kept in the text pieces');
}
for (const t of ['no tables here', fence, braces, esc, '']) {
  const o = open(t, 1, false), oa = open(t, 1, true);
  ok(o.tableCount === 0 && oa.tableCount === 0 && o.text === t && oa.text === t && !o.edits.length, 'fields: no table -> nothing: ' + JSON.stringify(t.slice(0, 12)));
}
// --- editable field (b1.73): the second press after typing = Variant A, compact as today ---
{
  const before = 'Над таблицата', after = 'Под таблицата';
  const o = open(before + '\n' + cs + '\n' + after, before.length + 3, false);
  const r = o.ranges[0];
  // typed in the field: a longer cell (alignment now broken), a word with two inner spaces, a new short row
  let tbl = o.text.slice(r.start, r.end)
    .replace('| note 1 |', '| note 1 и още думи |')
    .replace('| Text 2 |', '| Text  две |') + '\n| нов | ред |';
  const edited = o.text.slice(0, r.start) + tbl + o.text.slice(r.end);
  const c = api.planMarkdownTableFieldsClose(edited, [{ start: r.start, end: r.start + tbl.length }]);
  const want = before + '\n| Col1 header | Col 2 | Col 3 |\n| - | - | - |\n| Text 1 | Test | note 1 и още думи |\n| note 2 | Text  две | Test |\n| нов | ред |\n' + after;
  ok(c.text === want, 'edited field: 2nd press removes only padding and dashes, typed cell text word for word', c.text);
  ok(c.edits.every(e => /^[ \-|]*$/.test(e.text) && /^[ \-|]*$/.test(edited.slice(e.start, e.end))), 'edited field: every close edit only touches spaces / dashes / outer |');
  ok(!api.areAllMarkdownTablesAligned(c.text), 'edited field: no re-alignment on close (not Variant B/C)');
  // blank line typed at the top of the field: the table moved inside the range, still compacted
  const moved = o.text.slice(0, r.start) + '\n' + o.text.slice(r.start);
  const cm = api.planMarkdownTableFieldsClose(moved, [{ start: r.start, end: r.end + 1 }]);
  ok(cm.tableCount === 1 && cm.text === before + '\n\n' + dense + '\n' + after, 'edited field: table moved down inside the field still compacts');
  // separator row deleted: no longer a table -> left exactly as typed
  const broken = o.text.replace(/\n\| -+ \| -+ \| -+ \|/, '');
  const cb = api.planMarkdownTableFieldsClose(broken, [{ start: r.start, end: r.end - 33 }]);
  ok(cb.tableCount === 0 && cb.text === broken, 'edited field: broken table left as typed');
  // a table outside the field is not touched on close
  const two = o.text + '\n' + t2;
  const c2 = api.planMarkdownTableFieldsClose(two, o.ranges);
  ok(c2.text === before + '\n' + dense + '\n' + after + '\n' + t2, 'edited field: table outside the field untouched');
}
// --- plan 9: the editor opens with every table aligned (planMarkdownTableFieldsOpen, all = true) ---
{
  const cells = t => t.split('\n').filter(l => !/^\|?[\s\-|:]+\|?$/.test(l)).map(l => l.split('|').map(c => c.trim()).filter(Boolean));
  const before = 'Работна среща - бележки\nДнес минахме през трите неща: https://x.example {#L0#}';
  const after = 'Останалото - утре. {{код}}';
  const note = before + '\n' + cs + '\n' + after;
  [0, note.length, note.indexOf('Test')].forEach(caret => {
    const o = open(note, caret, true);
    ok(o.tableCount === 1 && o.text === before + '\n' + mock + '\n' + after, 'open: Cepreu table (no outer |) aligned + repaired, caret ' + caret);
  });
  const o = open(note, note.length, true);
  ok(JSON.stringify(cells(o.text.slice(o.ranges[0].start, o.ranges[0].end))) === JSON.stringify(cells('|' + cs.replace(/\n(?!\|)/g, '\n|'))), 'open: cell text word for word');
  ok(o.edits.every(e => /^[ \-|]*$/.test(e.text) && /^[ \-|]*$/.test(note.slice(e.start, e.end))), 'open: edits only add spaces / dashes / outer |');
  ok(api.planMarkdownTableFieldsClose(o.text, o.ranges).text === before + '\n' + dense + '\n' + after, 'open, then one press -> compact (Variant A)');
  const short = '| A | B |\n|-|\n| 1 | 2 |';
  const os = open('x\n' + short, 0, true);
  ok(os.text === run('x\n' + short, 0, true), 'open: short separator row -> exactly what hold on ▦ gives', os.text);
  const om = open(multi, multi.length, true);
  ok(om.tableCount === 3 && om.text === multiA, 'open: several tables -> all aligned');
  const oo = open(o.text, 0, true);
  ok(oo.edits.length === 0 && oo.text === o.text, 'open: already aligned note -> text unchanged');
  ok(open('само текст | с черта\nред', 3, true).tableCount === 0, 'open: no table -> no field');
}
console.log(`${n - fails}/${n} passed`); process.exit(fails ? 1 : 0);
