// Live check for the KB guide "table-work" (plan 11, b1.80) in a real browser on uni/ (static server, no Drive sign-in).
//   node .bolter/check/kb-table-work-live.mjs      (exit 1 on any failed assertion; shots .bolter/check/kb-work-*.png)
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  try { const b = await readFile(path.join(root, p)); res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8771);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
const kb = { bg: JSON.parse(await readFile('uni/lang/kb-bg.json', 'utf8')).general['table-work'], en: JSON.parse(await readFile('uni/lang/kb-en.json', 'utf8')).general['table-work'] };
const plain = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' }); // an SW taking control reloads the app mid-run
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
page.on('response', r => { if (r.status() >= 400 && !/user-icon\.png$/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); }); // user-icon.png: 404 at HEAD too, not ours

async function boot(lang) {
  await page.goto('http://localhost:8771/index.html');
  await page.waitForFunction(() => typeof version !== 'undefined' && version);
  // news already seen, no first-run guide: the assistant opens straight to the chat
  await page.evaluate(l => { localStorage.setItem('language', l); localStorage.setItem('guide', 'false'); localStorage.setItem('app_version_seen', version); }, lang);
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('app-ready') && typeof startApp === 'function' && version);
  await page.evaluate(() => { try { startApp(true); } catch (e) { } });
  await page.waitForFunction(() => window.kbAssistant !== undefined && contentModal, null, { timeout: 15000 });
  await page.evaluate(() => { const lp = document.getElementById('login-page'); if (lp) { lp.hidden = true; lp.style.display = 'none'; } });
  // a user with notes in the local database can edit (the edit button exists only then); without sign-in
  // startApp stops before reading the flags, so apply the defaults the app itself reads from localStorage
  const flags = await page.evaluate(() => { updateGlobalStateFlags(); return { useIndexedDb }; });
  ok(flags.useIndexedDb === true, `${lang}: local database on (app default) - notes are editable`);
  errors.length = 0; // startup noise without Drive sign-in is not ours
}

const state = () => page.evaluate(() => {
  const modal = document.getElementById('content-modal');
  const body = document.getElementById('modal-body');
  const tbl = body.querySelector('table.md-table-render');
  const ta = document.getElementById('note-edit-textarea');
  const split = ta?.parentElement.querySelector(':scope > .note-table-split');
  const field = split?.querySelector('.note-table-field');
  const btn = document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table');
  const g = document.querySelector('.guide-container');
  return {
    modal: modal.classList.contains('visible'),
    bubble: g?.querySelector('.speech-bubble span')?.innerHTML ?? null,
    table: tbl ? { borderless: tbl.classList.contains('md-table-borderless'), th: tbl.querySelectorAll('th').length, rows: [...tbl.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim()).join('|')),
      border: getComputedStyle(tbl.querySelector('td')).borderTopStyle } : null,
    editing: !!ta && body.contains(ta), text: ta?.value ?? null, split: !!split,
    field: field ? { text: field.value, font: getComputedStyle(field).fontFamily, wrap: getComputedStyle(field).whiteSpace, wrapAttr: field.getAttribute('wrap'), overflowX: getComputedStyle(field).overflowX } : null,
    btnActive: btn?.classList.contains('is-active') ?? null,
    guideBox: g ? (() => { const b = g.querySelector('.speech-bubble').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)]; })() : null,
  };
});
// the bubble of step k is on screen when its text is shown
const waitStep = (lang, k) => page.waitForFunction(t => {
  const s = document.querySelector('.guide-container .speech-bubble span'); return s && s.innerHTML === t && document.querySelector('.guide-container').style.opacity !== '0';
}, kb[lang].guide[k].text, { timeout: 5000 }).then(() => true, () => false);
// the guide follows its target every frame (the modal animates in), so measure once the bubble stops moving
const settled = () => page.evaluate(() => new Promise(res => {
  let last = '', same = 0, frames = 0;
  const tick = () => { const b = document.querySelector('.guide-container .speech-bubble')?.getBoundingClientRect(); const cur = b ? [b.left, b.top].map(Math.round).join() : '';
    same = cur === last ? same + 1 : 0; last = cur; if (same >= 10 || ++frames > 300) res(frames); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
const onScreen = async (W, k, width) => {
  await settled();
  const r = await page.evaluate(() => { const b = document.querySelector('.guide-container .speech-bubble').getBoundingClientRect(); const c = document.querySelector('.kb-chat-container, #kb-chat');
    return { box: [b.left, b.right, b.top, b.bottom].map(Math.round), chatHidden: !window.kbUI?.isOpen }; });
  ok(r.box[0] >= 0 && r.box[1] <= width && r.box[2] >= 0 && r.box[3] <= 800 && r.chatHidden, W + `step ${k}: bubble fully on screen, chat closed`, r);
};
const next = () => page.evaluate(() => document.querySelector('.guide-container .guide-img').click());
const shot = async file => {
  await page.waitForFunction(() => [document.getElementById('content-modal'), document.querySelector('#content-modal .modal-content-box')]
    .every(el => el && el.getAnimations({ subtree: false }).every(a => a.playState !== 'running')), null, { timeout: 5000 }).catch(() => console.log('info animation not settled for', file));
  await page.waitForFunction(() => { const g = document.querySelector('.guide-container'); return !g || getComputedStyle(g).opacity === '1'; }, null, { timeout: 5000 }).catch(() => console.log('info bubble not faded in for', file));
  await settled();
  await page.screenshot({ path: file });
};

async function run(lang, width, shots) {
  await page.setViewportSize({ width, height: 800 });
  await boot(lang);
  const W = `${lang} ${width}: `;
  // select the record the way the user does: ask the assistant, get table-work, press "Show me"
  await page.evaluate(() => document.getElementById('kb-fab').click());
  await page.waitForFunction(() => window.kbAssistant?.isInitialized && window.kbUI, null, { timeout: 8000 });
  const top = await page.evaluate(q => window.kbAssistant.matcher.search(q, 3).map(r => r.item?.id), kb[lang].question);
  ok(top[0] === 'table-work', W + 'assistant search for the question finds table-work first', top);
  const item = await page.evaluate(() => window.kbAssistant.kbData.general.find(r => r.id === 'table-work'));
  ok(item && item.question === kb[lang].question && Object.keys(item.guide).filter(k => /^\d+$/.test(k)).length === 7 && item.guide[1].text === kb[lang].guide[1].text && item.guide[1].action === 'note',
    W + 'merged record table-work: question + 7 steps with texts and core actions');
  await page.evaluate(q => { window.kbUI.inputField.value = q; window.kbUI.sendMessage(); }, kb[lang].question);
  const showMe = page.locator('.kb-message .kb-show-me-btn').last();
  await showMe.waitFor({ timeout: 5000 });
  ok(plain(await page.locator('.kb-answer-text').last().innerHTML()) === plain(kb[lang].answer), W + 'chat shows the table-work answer');
  await showMe.click(); // real input once

  // 1. demo note with a bordered table
  ok(await waitStep(lang, 1), W + 'step 1 bubble text'); await onScreen(W, 1, width);
  let s = await state();
  ok(s.modal && s.table && !s.table.borderless && s.table.th === 2 && s.table.rows.length === 2 && s.table.border !== 'none', W + 'step 1: note shows a bordered table with a header row', s.table);
  if (shots) await shot(`.bolter/check/kb-work-${width}-1.png`);
  // 2. minimum requirement, same note
  await next(); ok(await waitStep(lang, 2), W + 'step 2 bubble text'); await onScreen(W, 2, width);
  s = await state();
  ok(s.modal && s.table && !s.table.borderless, W + 'step 2: same note still open');
  if (shots) await shot(`.bolter/check/kb-work-${width}-2.png`);
  // 3. borderless table (%%)
  await next(); ok(await waitStep(lang, 3), W + 'step 3 bubble text (%%)'); await onScreen(W, 3, width);
  s = await state();
  ok(s.modal && s.table?.borderless && s.table.th === 0 && s.table.border === 'none' && s.table.rows.join() === 'aaaaaaaaa|1.10,bbbbbbbbb|2.30,ddddddddd|6.34',
    W + 'step 3: note shows the table without borders, no header row, only the data rows', s.table);
  if (shots) await shot(`.bolter/check/kb-work-${width}-3.png`);
  // 4. edit: the editor opens with the table already aligned in its field
  await next(); ok(await waitStep(lang, 4), W + 'step 4 bubble text'); await onScreen(W, 4, width);
  await page.waitForFunction(() => document.getElementById('note-edit-textarea'), null, { timeout: 5000 }).catch(() => {});
  s = await state();
  ok(s.editing && s.split && s.btnActive && /^\| %% +\| +\|$/m.test(s.field?.text || ''), W + 'step 4: editor open, table already aligned in its field (marker kept)', s.field?.text);
  if (shots) await shot(`.bolter/check/kb-work-${width}-4.png`);
  // 5. the guide presses ▦: compact form, the "before"
  await next(); ok(await waitStep(lang, 5), W + 'step 5 bubble text'); await onScreen(W, 5, width);
  s = await state();
  const compactLines = (s.text || '').split('\n').filter(l => l.includes('|'));
  ok(!s.split && !s.btnActive && compactLines[0] === '|%%| |' && compactLines[1] === '| - | - |', W + 'step 5: compact table, short separator, marker tight |%%|', compactLines);
  if (shots) await shot(`.bolter/check/kb-work-${width}-5.png`);
  // 6. the guide presses ▦ again: aligned table in its own field
  await next(); ok(await waitStep(lang, 6), W + 'step 6 bubble text'); await onScreen(W, 6, width);
  s = await state();
  const fl = (s.field?.text || '').split('\n');
  ok(s.split && s.btnActive && fl.length === 5 && new Set(fl.map(l => l.length)).size === 1 && fl[0].startsWith('| %% ') && fl[1].startsWith('| ---') && fl[2] === '| aaaaaaaaa | 1.10 |',
    W + 'step 6: ▦ click opened the field with the aligned table', fl);
  ok(/mono|courier/i.test(s.field?.font || '') && (s.field.wrap === 'pre' || s.field.wrapAttr === 'off') && /auto|scroll/.test(s.field.overflowX), W + 'step 6: field is monospace, no wrapping, scrolls sideways', s.field);
  if (shots) await shot(`.bolter/check/kb-work-${width}-6.png`);
  // 7. explanation of the second press + Save; nothing pressed
  await next(); ok(await waitStep(lang, 7), W + 'step 7 bubble text'); await onScreen(W, 7, width);
  s = await state();
  ok(s.split && s.btnActive, W + 'step 7: field still open (explain only)');
  if (shots) await shot(`.bolter/check/kb-work-${width}-7.png`);
  // end: the guide closes the demo note
  await next();
  await page.waitForFunction(() => !document.querySelector('.guide-container'), null, { timeout: 5000 }).catch(() => {});
  s = await state();
  ok(s.bubble === null && !s.modal, W + 'after step 7: guide gone, demo note closed', { bubble: s.bubble, modal: s.modal });
  ok(errors.length === 0, W + 'no page/console errors during the guide', errors);
}

await run('bg', 390, true);
await run('bg', 1280, true);
await run('en', 1280, false);
await browser.close(); srv.close();
console.log(fails ? `\n${fails} of ${n} FAILED` : `\nALL ${n} PASSED`); process.exit(fails ? 1 : 0);
