// Live check for the KB guide "Ctrl-actions" (plan 12, b1.81) in a real browser on uni/ (static server, no Drive sign-in,
// one board in the data). Run from repo root:
//   node .bolter/check/kb-ctrl-actions-live.mjs      (exit 1 on any failed assertion; shots .bolter/check/kb-ctrl-*.png)
import { chromium } from '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const root = path.resolve('uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  try { const b = await readFile(path.join(root, p)); res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8772);
let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
const kb = { bg: JSON.parse(await readFile('uni/lang/kb-bg.json', 'utf8')).general['Ctrl-actions'], en: JSON.parse(await readFile('uni/lang/kb-en.json', 'utf8')).general['Ctrl-actions'] };
const plain = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const DEMO = '.note[data-i="guide-demo-note"]';

const browser = await chromium.launch({ executablePath: '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--num-raster-threads=4'] });
// every request to Google APIs is counted (and refused): the demo must never reach Drive
const driveReqs = [], errors = [], clog = [];
let ctx, page;
async function openContext() { // a fresh context = a fresh local database
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/googleapis\.com/, route => { driveReqs.push(route.request().method() + ' ' + route.request().url()); return route.abort(); });
  page = await ctx.newPage();
  page.on('console', m => clog.push(m.text().slice(0, 160)));
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400 && !/user-icon\.png$/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
}

async function boot(lang, boards) {
  // seed: one board (or none) with two notes of the user in the local database, then a normal start from it
  await page.goto('http://localhost:8772/index.html');
  await page.waitForFunction(() => typeof createDatabaseFromMemory === 'function' && typeof version !== 'undefined' && version);
  await page.evaluate(async ([l, withBoard]) => {
    localStorage.setItem('language', l); localStorage.setItem('guide', 'false'); localStorage.setItem('app_version_seen', version);
    localStorage.setItem('useGoogleDb', 'false'); localStorage.setItem('useIndexedDb', 'true'); localStorage.removeItem('extendedMode');
    localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
    useGoogleDb = false; useIndexedDb = true;
    boardsData = withBoard ? [{ id: 1, gdid: 'b-1', title: 'Работа', color: 0, status: 0 }] : [];
    const now = Date.now();
    allNotesData = [
      { id: 11, gdid: 'n-11', notetxt: 'Записки от срещата\nСрок: петък', boardid: withBoard ? 'b-1' : 0, datemod: now - 60000, date: now - 60000, color: 0, version: 1 },
      { id: 12, gdid: 'n-12', notetxt: 'Списък за покупки\nмляко, хляб', boardid: withBoard ? 'b-1' : 0, datemod: now - 120000, date: now - 120000, color: 1, version: 1 },
    ];
    mediaData = [];
    await createDatabaseFromMemory({ suppressEmptyDataToast: true });
  }, [lang, boards]);
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('app-ready') && typeof startApp === 'function' && version);
  // startApp right at app-ready can be undone by the start-up's own offline probe; call it until it takes (as a user signing in would)
  await page.evaluate(() => new Promise(res => { let i = 0; const t = setInterval(() => { if (allNotesData.length || ++i > 10) { clearInterval(t); res(); } else if (!isAppStarted) startApp(true).catch(() => {}); }, 700); }));
  await page.waitForFunction(withBoard => window.kbAssistant !== undefined && allNotesData.length === 2 && boardsData.length === (withBoard ? 1 : 0)
    && [...notesContainer.querySelectorAll('.note[data-i]')].filter(e => e.style.display !== 'none').length === 2
    && (!withBoard || !!document.getElementById('popup-menu-btn-floating')), boards, { timeout: 15000 })
    .catch(async e => { console.log('boot state', await page.evaluate(() => ({ kb: window.kbAssistant !== undefined, n: allNotesData.length, b: boardsData.length,
      vis: [...notesContainer.querySelectorAll('.note[data-i]')].filter(e => e.style.display !== 'none').length, fl: !!document.getElementById('popup-menu-btn-floating'), started: isAppStarted })), errors, clog.slice(-40)); throw e; });
  errors.length = 0; // startup noise without Drive sign-in is not ours
  driveReqs.length = 0;
}

const state = () => page.evaluate(DEMO => {
  const visible = [...notesContainer.querySelectorAll('.note[data-i]')].filter(e => e.style.display !== 'none');
  const demo = document.querySelector(DEMO);
  const g = document.querySelector('.guide-container');
  const b = g?.querySelector('.speech-bubble')?.getBoundingClientRect();
  return {
    bubble: g?.querySelector('.speech-bubble span')?.innerHTML ?? null,
    box: b ? [b.left, b.right, b.top, b.bottom].map(Math.round) : null,
    demo: !!demo && demo.style.display !== 'none',
    demoData: allNotesData.filter(x => x.id === 'guide-demo-note').length,
    demoFirst: visible[0] === demo,
    pinned: !!demo?.classList.contains('note-pinned') && !!demo.querySelector('.note-pin-btn.pinned'),
    calendar: !!demo?.querySelector('.note-week-calendar'), calendars: document.querySelectorAll('.note-week-calendar').length,
    clock: !!demo?.querySelector('.clock'), clocks: notesContainer.querySelectorAll('.clock').length,
    titleShown: demo ? getComputedStyle(demo.querySelector('.note-title-wrapper')).display !== 'none' : null,
    fullscreen: document.querySelector('header').classList.contains('header-fullscreen'),
    confirm: document.getElementById('folderIdPromptPopup').classList.contains('show'),
    newBoard: document.getElementById('new-board-modal').classList.contains('visible'),
    extendedMode: localStorage.getItem('extendedMode'),
    notes: allNotesData.length, boardNotes: visible.length,
    chatOpen: !!window.kbUI?.isOpen,
  };
}, DEMO);
const waitStep = (text) => page.waitForFunction(t => {
  const s = document.querySelector('.guide-container .speech-bubble span'); return s && s.innerHTML === t && document.querySelector('.guide-container').style.opacity !== '0';
}, text, { timeout: 5000 }).then(() => true, () => false);
const settled = () => page.evaluate(() => new Promise(res => {
  let last = '', same = 0, frames = 0;
  const tick = () => { const b = document.querySelector('.guide-container .speech-bubble')?.getBoundingClientRect(); const c = document.querySelector('.guide-container .guide-img')?.getBoundingClientRect();
    const cur = b ? [b.left, b.top, c?.left, c?.top].map(Math.round).join() : '';
    same = cur === last ? same + 1 : 0; last = cur; if (same >= 10 || ++frames > 300) res(frames); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}));
const next = () => page.evaluate(() => document.querySelector('.guide-container .guide-img').click());
const shot = async file => {
  await page.waitForFunction(() => { const g = document.querySelector('.guide-container'); return !g || getComputedStyle(g).opacity === '1'; }, null, { timeout: 5000 }).catch(() => console.log('info bubble not faded in for', file));
  await settled();
  await page.screenshot({ path: file });
};
// the step's bubble is shown, fully on screen, chat closed; the pointer is not parked in the centre (target found)
async function step(W, lang, k, width) {
  ok(await waitStep(kb[lang].guide[k].text), W + `step ${k}: bubble text`);
  await settled();
  const s = await state();
  const centred = await page.evaluate(() => document.querySelector('.guide-container').style.transform.includes('-50%'));
  ok(s.box && s.box[0] >= 0 && s.box[1] <= width && s.box[2] >= 0 && s.box[3] <= 800 && !s.chatOpen && !centred, W + `step ${k}: bubble fully on screen, chat closed, pointer on its target`, { box: s.box, chat: s.chatOpen, centred });
  return s;
}

async function openGuide(lang, W) {
  await page.evaluate(() => document.getElementById('kb-fab').click());
  await page.waitForFunction(() => window.kbAssistant?.isInitialized && window.kbUI, null, { timeout: 8000 });
  const top = await page.evaluate(q => window.kbAssistant.matcher.search(q, 3).map(r => r.item?.id), kb[lang].question);
  ok(top[0] === 'Ctrl-actions', W + 'assistant search for the question finds Ctrl-actions first', top);
  const item = await page.evaluate(() => window.kbAssistant.kbData.general.find(r => r.id === 'Ctrl-actions'));
  const keys = Object.keys(item?.guide || {}).filter(k => /^\d+$/.test(k));
  ok(item && keys.length === 7 && item.guide[1].action === 'demoNote' && item.guide[1].text === kb[lang].guide[1].text && [5, 6, 7].every(k => item.guide[k].ctrl === true) && [2, 3, 4].every(k => !item.guide[k].ctrl),
    W + 'merged record Ctrl-actions: 7 steps, step 1 demoNote, Ctrl on 5-7 only', keys.length);
  await page.evaluate(q => { window.kbUI.inputField.value = q; window.kbUI.sendMessage(); }, kb[lang].question);
  const showMe = page.locator('.kb-message .kb-show-me-btn').last();
  await showMe.waitFor({ timeout: 5000 });
  const ans = plain(await page.locator('.kb-answer-text').last().innerHTML());
  ok(ans === plain(kb[lang].answer) && (lang === 'bg' ? /заглавието на бележка.*изтрива/ : /note's title.*deletes/).test(ans) && !/(кабърчето на бележка в борда - изтрива|pin in a board - deletes|само я откача|pin only unpins)/.test(ans),
    W + 'chat shows the Ctrl-actions answer (delete = title, no pin-unpin clause, plan 13) with the Show me invite');
  await showMe.click(); // real input once
}

async function run(lang, width, shots) {
  await page.setViewportSize({ width, height: 800 });
  await boot(lang, true);
  const W = `${lang} ${width}: `;
  const s0 = await state();
  const idb0 = await page.evaluate(async () => (await getAllFromDB('notes')).length);
  ok(s0.notes === 2 && s0.boardNotes === 2 && s0.extendedMode === null && !s0.fullscreen, W + 'start: 2 notes in one board, normal mode', s0);
  await openGuide(lang, W);

  let s = await step(W, lang, 1, width);
  ok(s.demo && s.demoData === 1 && s.notes === 3 && s.boardNotes === 3, W + 'step 1: demo note appears in the board', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-1.png`);

  await next(); s = await step(W, lang, 2, width);
  ok(s.calendar && s.calendars === 1, W + 'step 2: click on the date opened the week calendar in the demo note', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-2.png`);

  await next(); s = await step(W, lang, 3, width);
  ok(s.calendars === 0, W + 'step 3: calendar closed before the next step');
  ok(s.clock && !s.titleShown, W + 'step 3: click on the time shows the clock (title row hidden)', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-3.png`);

  await next(); s = await step(W, lang, 4, width);
  ok(s.clocks === 0 && s.titleShown, W + 'step 4: clock closed, title row back');
  await page.waitForFunction(DEMO => document.querySelector(DEMO)?.classList.contains('note-pinned'), DEMO, { timeout: 3000 }).catch(() => {});
  s = await state();
  ok(s.pinned && s.demoFirst, W + 'step 4: click on ◎ pinned the demo note, first in the board', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-4.png`);

  await next(); s = await step(W, lang, 5, width);
  ok(s.fullscreen, W + 'step 5: Ctrl+click on the floating button switched to header-fullscreen', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-5.png`);

  await next(); s = await step(W, lang, 6, width);
  ok(!s.fullscreen && s.extendedMode === null, W + 'step 6: full-screen mode back to normal, extendedMode untouched', s);
  ok(s.confirm, W + 'step 6: Ctrl+click on the title asks for the delete confirmation', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-6.png`);

  await next(); s = await step(W, lang, 7, width);
  ok(!s.confirm && s.demo && s.demoData === 1, W + 'step 7: confirmation cancelled (No), the demo note is still there');
  ok(s.newBoard, W + 'step 7: Ctrl+click on + opened the new board window', s);
  if (shots) await shot(`.bolter/check/kb-ctrl-${width}-7.png`);

  await next();
  await page.waitForFunction(() => !document.querySelector('.guide-container'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(DEMO => !document.querySelector(DEMO), DEMO, { timeout: 3000 }).catch(() => {});
  s = await state();
  ok(s.bubble === null && !s.demo && s.demoData === 0, W + 'end: guide gone, demo note removed from the board and from allNotesData', s);
  ok(!s.fullscreen && s.calendars === 0 && s.clocks === 0 && !s.confirm && !s.newBoard, W + 'end: no header-fullscreen, calendar, clock, confirmation or new board window left', s);
  ok(s.notes === s0.notes && s.boardNotes === s0.boardNotes && s.extendedMode === s0.extendedMode, W + 'end: allNotesData, board note count and extendedMode as at the start', { s0, s });
  const idb = await page.evaluate(async () => { const all = await getAllFromDB('notes'); return { n: all.length, demo: all.filter(x => x.id === 'guide-demo-note' || x.guideDemo).length }; });
  ok(idb.n === idb0 && idb.demo === 0, W + 'end: local database untouched (no demo note)', { idb0, idb });
  ok(driveReqs.length === 0, W + 'no request to Google Drive during the guide', driveReqs);
  ok(errors.length === 0, W + 'no page/console errors during the guide', errors);
}

async function runNoBoard(lang, width) {
  await page.setViewportSize({ width, height: 800 });
  await boot(lang, false);
  const W = `${lang} ${width} no board: `;
  const s0 = await state();
  await openGuide(lang, W);
  ok(await waitStep(kb[lang].guide[1].noBoardText), W + 'step 1 shows the one-sentence "needs a board first"');
  await settled();
  let s = await state();
  ok(!s.demo && s.demoData === 0 && s.notes === s0.notes && s.box && s.box[0] >= 0 && s.box[1] <= width && s.box[3] <= 800, W + 'no demo note, no board created, bubble on screen', s);
  await page.evaluate(() => typeof boardsData !== 'undefined' && boardsData.length).then(v => ok(!v, W + 'boardsData still empty', v));
  await shot(`.bolter/check/kb-ctrl-${width}-noboard.png`);
  await next();
  await page.waitForFunction(() => !document.querySelector('.guide-container'), null, { timeout: 3000 }).catch(() => {});
  s = await state();
  ok(s.bubble === null, W + 'the guide stops after the first step', s.bubble);
  ok(errors.length === 0 && driveReqs.length === 0, W + 'no errors, no Drive requests', { errors, driveReqs });
}

await openContext();
await run('bg', 390, true);
await run('bg', 1280, true);
await run('en', 1280, false);
await openContext();
await runNoBoard('bg', 390);
await ctx.close(); await browser.close(); srv.close();
console.log(fails ? `\n${fails} of ${n} FAILED` : `\nALL ${n} PASSED`); process.exit(fails ? 1 : 0);
