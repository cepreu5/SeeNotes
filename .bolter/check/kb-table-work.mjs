// Static check for the permanent KB guide "table-work" (plan 11, b1.80). Run from repo root:
//   node .bolter/check/kb-table-work.mjs      (exit 1 on any failed assertion)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let fails = 0, n = 0;
const ok = (c, m) => { n++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const ID = 'table-work', STEPS = ['1', '2', '3', '4', '5', '6', '7'];
const T = '#content-modal .modal-edit-toolbar-btn.is-table';
const numKeys = g => Object.keys(g || {}).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
const base = f => JSON.parse(execFileSync('git', ['show', `fac42c0:uni/lang/${f}.json`], { maxBuffer: 1 << 26 }).toString());

// 1. the three files parse
const files = {};
for (const f of ['kb-core', 'kb-bg', 'kb-en']) {
  try { files[f] = JSON.parse(readFileSync(`uni/lang/${f}.json`, 'utf8')); ok(true, `${f}.json parses`); }
  catch (e) { ok(false, `${f}.json parses: ${e.message}`); }
}
if (fails) process.exit(1);

// 2. place: core general[] right after organize-notes, before calendar-view; bg/en keys likewise
const gen = files['kb-core'].general;
const at = gen.findIndex(r => r.id === ID);
ok(at > 0 && gen[at - 1].id === 'organize-notes' && gen[at + 1].id === 'calendar-view', `core: ${ID} sits between organize-notes and calendar-view (index ${at})`);
ok(gen.filter(r => r.id === ID).length === 1, `core: ${ID} appears once`);
const core = gen[at];
ok(core.category === 'workflow', 'core: category workflow');
for (const f of ['kb-bg', 'kb-en']) {
  const keys = Object.keys(files[f].general);
  const i = keys.indexOf(ID);
  ok(i > 0 && keys[i - 1] === 'organize-notes' && keys[i + 1] === 'calendar-view', `${f}: ${ID} key between organize-notes and calendar-view`);
}

// 3. steps 1:1 between core and bg/en
const cg = core.guide;
ok(numKeys(cg).join() === STEPS.join(), `core guide steps are 1..7 (got ${numKeys(cg)})`);
for (const f of ['kb-bg', 'kb-en']) {
  const r = files[f].general[ID];
  ok(r && Array.isArray(r.keywords) && r.keywords.length && r.question && r.answer, `${f}: keywords[]/question/answer present`);
  ok(numKeys(r.guide).join() === numKeys(cg).join(), `${f}: guide steps match core 1:1 (${numKeys(r.guide)})`);
  for (const s of STEPS) {
    const st = r.guide[s] || {};
    ok(typeof st.text === 'string' && st.text.trim() && Object.keys(st).join() === 'text', `${f} step ${s}: text only`);
  }
}
ok(/%%/.test(files['kb-bg'].general[ID].guide['3'].text) && /%%/.test(files['kb-en'].general[ID].guide['3'].text), 'step 3 text (bg/en) is about %%');

// 4. core actions/targets, no texts in core
const expect = {
  1: ['note', '#modal-body'], 2: ['explain', '#modal-body'], 3: ['note', '#modal-body'],
  4: ['#note-edit-btn', '#note-edit-btn'], 5: [T, T], 6: [T, '#content-modal .note-table-field'], 7: ['explain', T],
};
for (const s of STEPS) {
  const st = cg[s] || {};
  ok(st.action === expect[s][0] && st.target === expect[s][1], `core step ${s}: action=${JSON.stringify(st.action)} target=${JSON.stringify(st.target)}`);
  ok(!('text' in st) && st.time > 0 && st.time <= 15000 && /^msm\/.+\.png$/.test(st.image), `core step ${s}: no text, time ${st.time}, image ${st.image}`);
}
ok(cg.action === 'explain!' && cg.stopAfter === false, 'core guide-level action=explain! stopAfter=false');

// 5. demo notes: step 1 a bordered table (same note as Beta 1.60), step 3 the same rows with %% (borderless)
const b160 = gen.find(r => r.id === 'Beta 1.60').guide['1'].noteContent;
ok(cg[1].noteContent === b160, 'step 1 note is the Beta 1.60 demo note');
const firstTableHeader = t => { const ls = t.split('\n'); const i = ls.findIndex((l, k) => l.includes('|') && /^\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/.test(ls[k + 1] || '')); return i < 0 ? null : ls[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); };
ok(firstTableHeader(cg[1].noteContent)?.[0] !== '%%', 'step 1 table has borders');
ok(firstTableHeader(cg[3].noteContent)?.[0] === '%%', 'step 3 table: %% in the first cell');
const dataRows = t => t.split('\n').filter(l => /^\| [a-z]{9} \|/.test(l));
ok(dataRows(cg[3].noteContent).join() === dataRows(cg[1].noteContent).join(), 'step 3: same rows as step 1');

// 6. old records untouched (every record other than table-work is identical to fac42c0)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const oldCore = base('kb-core');
ok(same(oldCore.general, gen.filter(r => r.id !== ID)) && same(oldCore.settings, files['kb-core'].settings) && same(oldCore.metadata, files['kb-core'].metadata), 'kb-core: all other records identical to fac42c0');
for (const f of ['kb-bg', 'kb-en']) {
  const old = base(f), cur = files[f];
  const { [ID]: _, ...rest } = cur.general;
  ok(same(old.general, rest) && same(old.settings, cur.settings) && same(old.ui_texts, cur.ui_texts), `${f}: all other records identical to fac42c0`);
}
for (const f of ['i18n-bg', 'i18n-en'])
  ok(readFileSync(`uni/lang/${f}.json`, 'utf8') === execFileSync('git', ['show', `fac42c0:uni/lang/${f}.json`]).toString(), `${f}.json untouched`);

// 7. selectors exist in the app, CACHE_NAME bumped
const mainJs = readFileSync('uni/main.js', 'utf8'), html = readFileSync('uni/index.html', 'utf8');
for (const n of ['note-edit-btn', 'modal-edit-toolbar-btn', 'is-table', 'note-table-field'])
  ok(new RegExp(`['"\`. ]${n}['"\`. ]`).test(mainJs), `${n} in uni/main.js`);
ok(/id="modal-body"/.test(html) && /id="content-modal"/.test(html), '#modal-body / #content-modal in index.html');
const sw = readFileSync('uni/sw.js', 'utf8');
ok(/const CACHE_NAME = 'cx-notes-b1\.80';/.test(sw) && !sw.includes('b1.79'), 'uni/sw.js CACHE_NAME is cx-notes-b1.80');

console.log(fails ? `\n${fails} of ${n} check(s) FAILED` : `\nALL ${n} CHECKS PASSED`);
process.exit(fails ? 1 : 0);
