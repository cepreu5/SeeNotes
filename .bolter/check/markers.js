// {#L<n>#} markers and code placeholder: display strip, save restore, atomic code block.
// Run: node .bolter/check/markers.js   (MAIN=path/to/main.js to run against another copy)
const fs = require('fs');
const src = fs.readFileSync(process.env.MAIN || (__dirname + '/../../uni/main.js'), 'utf8');
const slice = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error('slice ' + from); return src.slice(a, b); };
const esc = slice('function escapeHtml(text)', '\n}\n') + '\n}\n';
const render = slice('function adjustFormatStringOffset', 'window.copyCode = function');
const edit = slice('function postEdit(', '// BOARD CREATION');
const store = {};
const api = new Function('localStorage', 'window', '_', 'copyIconSvg', 'parseMarkdownTable', 'renderMarkdownTableAsPseudoGraphic',
  esc + render + edit + '; return { formatText, processNoteContent, renderNoteContent, getFormattedNoteHtml, preEdit, postEdit, ' +
  'reserveLinkMarkerSlots: typeof reserveLinkMarkerSlots === "function" ? reserveLinkMarkerSlots : null };')(
  { getItem: k => (k in store ? store[k] : null) }, {}, k => k, '<svg/>', () => null, () => '');
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m); if (extra !== undefined) console.log('     ', JSON.stringify(extra)); } else console.log('ok  ', m); };
const fmt = (...fs) => fs.map(f => JSON.stringify({ paramint: 0, paramfloat: 0, ...f })).join('|') + '|';
const codeCount = h => (h.match(/<div class="code-block">/g) || []).length;
const noLeak = h => !h.includes('%%CODE_BLOCK%%') && !h.includes('%CODE_BLOCK%') && !h.includes('\uE000');

// (a) stale text_span with a boundary inside the placeholder region
{
  const t = 'Hi {{x}}';                       // 8 chars; old placeholder text was 17 chars long
  const h = api.formatText(t, fmt({ start: 0, end: 10, type: 1 }), true);
  ok(codeCount(h) === 1 && h.includes('<code>x</code>') && noLeak(h), '(a) stale span ending inside placeholder -> real code block, no marker', h);
  const h2 = api.getFormattedNoteHtml('Note tanning app\n{{const a = 1;}}\nend', fmt({ start: 3, end: 22, type: 2 }, { start: 40, end: 60, type: 1 }), null, true);
  ok(codeCount(h2) === 1 && noLeak(h2) && h2.includes('const a = 1;'), '(a) preview path: partially stale spans still render code', h2);
  const t3 = 'A {{one}} B ```two``` C';
  const h3 = api.formatText(t3, fmt({ start: 0, end: 1, type: 1 }, { start: 10, end: 11, type: 2 }, { start: 5, end: 200, type: 3 }), true);
  ok(codeCount(h3) === 2 && h3.indexOf('<code>one</code>') < h3.indexOf('<code>two</code>') && noLeak(h3) && h3.includes('<strong>A</strong>'), '(a) two code blocks, in order, valid spans kept', h3);
  const t4 = 'x {{a}} y {{b}}';
  for (let s = 0; s <= t4.length; s++) for (let e = s + 1; e <= t4.length + 20; e++) {
    const h4 = api.formatText(t4, fmt({ start: s, end: e, type: 1 }), false);
    if (codeCount(h4) !== 2 || !noLeak(h4)) { ok(false, `(a) exhaustive span ${s}-${e}`, h4); s = 1e9; break; }
  }
  ok(true, '(a) every span start/end over a two-code note renders both blocks, no marker');
  const h5 = api.processNoteContent('p {{a}} _q_ {{b}}', false);
  ok(codeCount(h5) === 2 && noLeak(h5) && h5.includes('<u>q</u>'), '(a) underline between two placeholders does not split them', h5);
}

// (b) {#L0#} {#L1#} never reach the output
{
  const h = api.getFormattedNoteHtml('my memo\nGitHub: {#L0#} and viewer: {#L1#} done', null, null, true);
  ok(!h.includes('{#L') && h.includes('GitHub:  and viewer:  done') && h.includes('my memo'), '(b) plain note: markers gone, words intact', h);
  const h2 = api.getFormattedNoteHtml('Title {#L0#}|body {#L1#} tail', fmt({ start: 0, end: 4, type: 1 }), fmt({ start: 0, end: 5, type: 2 }), false);
  ok(!h2.includes('{#L') && h2.includes('<em>Title</em>') && h2.includes('<strong>body</strong>') && h2.includes('tail'), '(b) title|body with spans: markers gone', h2);
  const h3 = api.getFormattedNoteHtml('only {#L12#}', fmt({ start: 0, end: 4, type: 1 }), null, false);
  ok(!h3.includes('{#L') && h3.includes('<strong>only</strong>'), '(b) multi-digit marker gone', h3);
}

// (c) emphasis after a stripped marker stays on the same words
{
  const t = 'see {#L0#} and {#L1#} bold here';
  const s = t.indexOf('bold');
  const h = api.getFormattedNoteHtml(t, fmt({ start: s, end: s + 4, type: 1 }, { start: 0, end: 3, type: 2 }), null, true);
  ok(h.includes('<strong>bold</strong>') && h.includes('<em>see</em>') && !h.includes('{#L'), '(c) bold after two markers still on "bold"', h);
  const s2 = t.indexOf('and');
  const h2 = api.getFormattedNoteHtml(t, fmt({ start: 5, end: s2 + 3, type: 3 }), null, true);
  ok(h2.includes('<u> and</u>') && !h2.includes('{#L'), '(c) span starting inside a marker moves to its start', h2);
}

// (d) link in title + link in body restored exactly, in place
{
  const title = 'Site https://a.example/x';
  const body = 'Doc https://b.example/y and end';
  const bodyFmts = [{ start: body.indexOf('and'), end: body.indexOf('and') + 3, type: 1, paramint: 0, paramfloat: 0 }];
  const slots = api.reserveLinkMarkerSlots(title + '\n' + body);
  const tr = api.preEdit(title, [], -1, slots);
  const br = api.preEdit(body, bodyFmts, -1, slots);
  ok(tr.text === 'Site {#L0#}' && br.text.startsWith('Doc {#L1#}'), '(d) numbering is global across title+body', [tr.text, br.text]);
  const masked = JSON.parse(JSON.stringify(slots));      // as stored in dataset.maskedLinks
  const tp = api.postEdit(tr.text, [], masked), bp = api.postEdit(br.text, [], masked);
  ok(tp.text === title && bp.text === body && tp.removedLinkMarkers === 0 && bp.removedLinkMarkers === 0, '(d) both urls restored in the right places', [tp.text, bp.text]);
  ok(bp.formats.some(f => f.type === 1 && body.slice(f.start, f.end) === 'and'), '(d) bold after the restored link lands on the same word', bp.formats);
  const stale = 'old {#L0#} new https://c.example';
  const sr = api.preEdit(stale, [], -1);
  ok(sr.text === 'old {#L0#} new {#L1#}' && sr.maskedLinks[0] === null, '(d) a marker already in the note is not reused by a new link', sr);
  const sp = api.postEdit(sr.text, [], JSON.parse(JSON.stringify(sr.maskedLinks)));
  ok(sp.text === 'old  new https://c.example' && sp.removedLinkMarkers === 1, '(d) new link restored, stale marker removed', sp);
}

// (e) no masked-link list -> marker removed, reported
{
  const t = 'a {#L0#} b **c**';
  const r = api.postEdit(t, []);
  ok(!r.text.includes('{#L') && r.text === 'a  b c' && r.removedLinkMarkers === 1, '(e) no list: marker removed and reported', r);
  ok(r.formats.some(f => f.type === 1 && r.text.slice(f.start, f.end) === 'c'), '(e) bold after the removed marker still on "c"', r.formats);
  const r2 = api.postEdit('x {#L3#} y {#L0#}', [], ['https://only.example']);
  ok(r2.text === 'x  y https://only.example' && r2.removedLinkMarkers === 1, '(e) index out of range removed, valid one restored', r2);
  const r3 = api.postEdit('plain text', [], []);
  ok(r3.text === 'plain text' && r3.removedLinkMarkers === 0, '(e) no marker -> nothing removed', r3);
}

// (f) normal cases
{
  const h = api.getFormattedNoteHtml('hello world', null, null, false);
  ok(h === 'hello world', '(f) plain note', h);
  const h2 = api.getFormattedNoteHtml('Head|line1\nline2', null, null, false);
  ok(h2 === 'Head<br>line1<br>line2', '(f) note with | title/body split', h2);
  const h3 = api.getFormattedNoteHtml('before {{a < b}} after', null, null, true);
  ok(codeCount(h3) === 1 && h3.includes('<code>a &lt; b</code>') && noLeak(h3), '(f) {{ }} code', h3);
  const h4 = api.getFormattedNoteHtml('x\n```\nlet y = 2;\n```\nz', fmt({ start: 0, end: 1, type: 1 }), null, true);
  ok(codeCount(h4) === 1 && h4.includes('let y = 2;') && h4.includes('<strong>x</strong>') && noLeak(h4), '(f) ``` fence with a span', h4);
  const h5 = api.renderNoteContent('r {{q}} https://x.example');
  ok(codeCount(h5) === 1 && h5.includes('<a href="https://x.example"') && noLeak(h5), '(f) renderNoteContent code + link', h5);
  const round = api.postEdit(api.preEdit('A https://u.example B', []).text, [], ['https://u.example']);
  ok(round.text === 'A https://u.example B' && round.removedLinkMarkers === 0, '(f) single-part preEdit/postEdit round trip', round);
  ok(api.formatText('**', '', false) !== undefined && api.getFormattedNoteHtml('', null) === '', '(f) empty input');
}
// (g) plan 9: open (preEdit) -> tables auto-aligned in the editor -> Save (postEdit): no markers, cells word for word
{
  const ta = src.indexOf('// --- Markdown table alignment'), tb = src.indexOf('// --- end markdown table alignment');
  const tapi = new Function(src.slice(ta, tb) + '; return { planMarkdownTableFieldsOpen };')();
  const table = '|Col1 header| Col 2|Col 3\n|-|-|-|\nText 1|Test|note 1\nnote 2|Text 2|Test';
  const aligned = '| Col1 header | Col 2  | Col 3  |\n| ----------- | ------ | ------ |\n| Text 1      | Test   | note 1 |\n| note 2      | Text 2 | Test   |';
  const raw = 'Днес https://a.example и https://b.example:\n' + table + '\nУтре {{код | с черта}} край';
  const pre = api.preEdit(raw, []);
  const links = (pre.maskedLinks || []);
  const o = tapi.planMarkdownTableFieldsOpen(pre.text, pre.text.length, true);
  ok(o.tableCount === 1 && o.text.includes(aligned), '(g) editor text holds the aligned table', o.text);
  const saved = api.postEdit(o.text, [], links).text;
  ok(saved === raw.replace(table, aligned), '(g) saved text = note with the aligned table, links back in order', saved);
  ok(!/\{#L\d+#\}/.test(saved) && noLeak(saved), '(g) saved text has no {#L#} / CODE_BLOCK markers', saved);
  const words = t => t.split(/[\s|\-]+/).filter(Boolean);
  ok(JSON.stringify(words(saved)) === JSON.stringify(words(raw)), '(g) every word of the note kept, in order');
  const clr = api.postEdit('a --b-- c\n| A    | B |\n| ---- | - |\n| x -- | y |', [], []).text;
  ok(clr === 'a b c\n| A    | B |\n| ---- | - |\n| x -- | y |'.replace('| x -- | y |', '| x  | y |'), '(g) -- clear marker still works outside the separator row', clr);
  const shown = api.formatText(aligned, fmt({ start: 0, end: 3, type: 1 }), false);
  ok(shown.includes('| ----------- | ------ | ------ |'), '(g) display keeps the separator dashes', shown);
}
console.log(`${n - fails}/${n} passed`); process.exit(fails ? 1 : 0);
