// Жива проверка на демо бележката (водач Ctrl-actions) в продукционния билд (Beta/), с борд в данните.
// Пуска Beta два пъти в един браузър: с mainn.js на собственика (owner) и с mainn.js, генериран тук от
// поправения uni/main.js (patched; само в копието, нищо генерирано не се пази). Бордът се засява през
// dev страницата uni/ на същия origin (обща IndexedDB), после се отваря Beta. От корена на репото:
//   node .bolter/check/prod-demo-note.mjs       (снимки .bolter/check/prod-demo-note-<variant>.png; exit 1 при провал)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, cp, rm, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/nvm/versions/node/v22.23.2/lib/node_modules/playwright/index.js');
const terser = require('/opt/nvm/versions/node/v22.23.2/lib/node_modules/terser');

const COPY = '.bolter/check/.beta-copy';
await rm(COPY, { recursive: true, force: true }); await cp('Beta', COPY, { recursive: true });
// документираната команда от uni/main.js ред 2: terser main.js --compress --mangle --toplevel
const gen = await terser.minify(await readFile('uni/main.js', 'utf8'), { compress: true, mangle: true, toplevel: true });
const MAINN = { owner: await readFile('Beta/mainn.js'), patched: Buffer.from(gen.code) };
console.log('mainn.js bytes', JSON.stringify({ owner: MAINN.owner.length, patched: MAINN.patched.length, terser: require('/opt/nvm/versions/node/v22.23.2/lib/node_modules/terser/package.json').version }));
let variant = 'owner';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try {
    const b = p === '/mainn.js' ? MAINN[variant] : p.startsWith('/uni/') ? await readFile(join('uni', p.slice(5))) : await readFile(join(COPY, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(8768);
const URL0 = 'http://localhost:8768';
const DEMO = '.note[data-i="guide-demo-note"]';
const NAMES = ['boardsData', 'allNotesData', 'currentBoardFilter', 'notesContainer', 'createNoteElement', 'filterNotesByBoard', 'applyFilters', 'toggleHeaderFullscreen'];
const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const results = {};

async function run(v) {
  variant = v;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(URL0 + '/'), r => r.abort()); // нищо не излиза навън (Drive и пр.)
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => log.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on('pageerror', e => log.push('[pageerror] ' + e.message));
  const R = results[v] = {};

  // 1) засяване: един борд и две бележки в локалната база, през неминифицирания uni/
  await page.goto(URL0 + '/uni/index.html');
  await page.waitForFunction(() => typeof createDatabaseFromMemory === 'function' && typeof version !== 'undefined' && version);
  await page.evaluate(async () => {
    localStorage.setItem('language', 'bg'); localStorage.setItem('guide', 'false'); localStorage.setItem('app_version_seen', 'Beta 9.99');
    localStorage.setItem('useGoogleDb', 'false'); localStorage.setItem('useIndexedDb', 'true'); localStorage.removeItem('extendedMode');
    localStorage.setItem('initial_setup_complete', 'true'); localStorage.setItem('folderSetupDone', 'true');
    useGoogleDb = false; useIndexedDb = true;
    boardsData = [{ id: 1, gdid: 'b-1', title: 'Работа', color: 0, status: 0 }];
    const now = Date.now();
    allNotesData = [
      { id: 11, gdid: 'n-11', notetxt: 'Записки от срещата\nСрок: петък', boardid: 'b-1', datemod: now - 60000, date: now - 60000, color: 0, version: 1 },
      { id: 12, gdid: 'n-12', notetxt: 'Списък за покупки\nмляко, хляб', boardid: 'b-1', datemod: now - 120000, date: now - 120000, color: 1, version: 1 },
    ];
    mediaData = [];
    await createDatabaseFromMemory({ suppressEmptyDataToast: true });
  });

  // 2) продукционният билд от същата база (фалшив токен като в assistant-ctrl-actions.mjs, за да мине входа)
  // и ?offline: startApp не се вижда отвън в минифицирания билд, а офлайн режимът на приложението тръгва направо от локалната база
  await page.evaluate(async () => {
    localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'fake-token-for-local-test', expires_in: 3599, timestamp: Date.now() }));
    await (await caches.open('app-cache')).put('s', new Response('1'));
  });
  await page.goto(URL0 + '/index.html?offline');
  await page.waitForFunction(() => document.body.classList.contains('app-ready'));
  const notesUp = await page.waitForFunction(() => document.querySelectorAll('#notes-container .note[data-i]').length >= 2, null, { timeout: 15000 }).then(() => true, () => false);
  R.boot = await page.evaluate(() => ({ notes: document.querySelectorAll('#notes-container .note[data-i]').length, login: getComputedStyle(document.getElementById('login-page') || document.body).display }));
  R.boot.notesUp = notesUp;
  await page.evaluate(() => { const lp = document.getElementById('login-page'); if (lp) { lp.hidden = true; lp.style.display = 'none'; } });
  R.typeofs = await page.evaluate(N => Object.fromEntries(N.map(n => [n, typeof window[n]])), NAMES);
  R.live = await page.evaluate(() => ({ boards: Array.isArray(window.boardsData) ? window.boardsData.length : null, notes: Array.isArray(window.allNotesData) ? window.allNotesData.length : null, filter: window.currentBoardFilter ?? null, container: window.notesContainer?.id ?? null }));
  const bootNotes = R.live.notes;

  const ask = async q => {
    await page.evaluate(q => { const i = document.getElementById('kb-input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('kb-send-btn').click(); }, q);
    await page.waitForFunction(q => { const m = [...document.querySelectorAll('#kb-chat-messages > *')]; const i = m.findIndex(e => e.innerText.includes(q)); return i >= 0 && i < m.length - 1; }, q, { timeout: 5000 }).catch(() => { });
    return page.evaluate(q => { const m = [...document.querySelectorAll('#kb-chat-messages > *')]; const i = m.findLastIndex(e => e.innerText.includes(q)); return m.slice(i + 1).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 90)).join(' | '); }, q);
  };
  const openKb = async () => {
    await page.evaluate(() => { if (!window.kbUI) document.getElementById('kb-fab').click(); else if (!window.kbUI.isOpen) window.kbUI.open(); });
    await page.waitForFunction(() => window.kbUI?.isOpen && window.kbAssistant?.isInitialized, null, { timeout: 10000 });
  };
  const st = () => page.evaluate(DEMO => {
    const d = document.querySelector(DEMO);
    return {
      bubble: document.querySelector('.guide-container .speech-bubble')?.innerText.replace(/\s+/g, ' ').slice(0, 70) || null,
      demo: !!d && d.style.display !== 'none', demoData: (window.allNotesData || []).filter(n => n.guideDemo).length,
      calendar: !!d?.querySelector('.note-week-calendar'), clock: !!d?.querySelector('.clock'), pinned: !!d?.classList.contains('note-pinned'),
      fullscreen: document.querySelector('header').classList.contains('header-fullscreen'), extended: localStorage.getItem('extendedMode'),
      modals: ['new-board-modal', 'boards-menu-modal', 'content-modal'].filter(id => document.getElementById(id)?.classList.contains('visible')),
      popup: !!document.getElementById('folderIdPromptPopup')?.classList.contains('show'),
    };
  }, DEMO);

  // 3) Ctrl-actions като потребител: въпрос + „Покажи ми“
  await openKb();
  R.answerCtrl = await ask('Допълнителни команди');
  await page.evaluate(() => [...document.querySelectorAll('.kb-show-me-btn')].pop().click());
  await page.waitForFunction(() => document.querySelector('.guide-container .speech-bubble'), null, { timeout: 5000 }).catch(() => { });
  await page.waitForFunction(DEMO => document.querySelector(DEMO), DEMO, { timeout: 2500 }).catch(() => { });
  R.step1 = await st();
  await page.screenshot({ path: `.bolter/check/prod-demo-note-${v}.png` });
  // стъпките 2..7 (шестте команди): чакаме смяна на стъпката (текста на балончето), не фиксиран сън
  R.steps = [];
  if (R.step1.demo) {
    for (let i = 2; i <= 7; i++) {
      const before = (await st()).bubble;
      const clicked = await page.evaluate(() => { const n = document.querySelector('.guide-container .guide-next, .guide-container [data-action="next"]'); if (n) { n.click(); return 'next'; } window.kbAssistant.nextGuideStep?.(); return null; });
      await page.waitForFunction(b => { const t = document.querySelector('.guide-container .speech-bubble')?.innerText.replace(/\s+/g, ' ').slice(0, 70) || null; return t !== b; }, before, { timeout: 15000 }).catch(() => { });
      await page.waitForTimeout(600); // стъпката изпълнява командата си след показването на балончето
      const s = await st(); s.step = i; s.via = clicked; R.steps.push(s);
      if (i === 4) await page.screenshot({ path: `.bolter/check/prod-demo-note-${v}-step${i}.png` });
      if (!s.bubble) break;
    }
  }
  await page.evaluate(() => window.kbAssistant.terminateGuide?.());
  await page.waitForFunction(DEMO => !document.querySelector('.guide-container') && !document.querySelector(DEMO), DEMO, { timeout: 3000 }).catch(() => { });
  R.afterEnd = await st(); R.afterEnd.demoEls = await page.evaluate(DEMO => document.querySelectorAll(DEMO).length, DEMO);
  R.afterEnd.notesData = await page.evaluate(() => window.allNotesData?.length ?? null); R.afterEnd.bootNotes = bootNotes;
  R.afterEnd.idbDemo = await page.evaluate(() => new Promise(res => { const o = indexedDB.open('NotesDB'); o.onsuccess = () => { const q = o.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result.filter(n => n.guideDemo || n.id === 'guide-demo-note').length); q.onerror = () => res('err'); }; o.onerror = () => res('err'); }));
  await page.screenshot({ path: `.bolter/check/prod-demo-note-${v}-end.png` });

  // 4) table-work стъпка 1 + обикновен въпрос
  await openKb();
  await ask('Как се работи с таблица в бележка?');
  R.twClicked = await page.evaluate(() => { const b = [...document.querySelectorAll('.kb-show-me-btn')].filter(b => JSON.parse(b.dataset.guide)['1']?.editTable).pop(); if (b) b.click(); return !!b; });
  await page.waitForFunction(() => document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table.is-active'), null, { timeout: 5000 }).catch(() => { });
  R.tableWork = await page.evaluate(() => ({ modal: !!document.getElementById('content-modal')?.classList.contains('visible'), tableBtnActive: !!document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table.is-active'), textarea: !!document.querySelector('#modal-body textarea') }));
  await page.evaluate(() => window.kbAssistant.terminateGuide?.());
  await page.evaluate(() => document.getElementById('content-modal')?.classList.remove('visible'));
  await openKb();
  R.plain = await ask('Как да създам нова бележка?');
  R.pageerrors = log.filter(l => l.startsWith('[pageerror]') && !/kofiWidgetOverlay/.test(l)); // ko-fi е външен скрипт, спрян от route-а
  R.errors = log.filter(l => l.startsWith('[error]') && !/Failed to load resource|ERR_FAILED/.test(l)).slice(0, 8);
  await ctx.close();
}

for (const v of ['owner', 'patched']) {
  try { await run(v); } catch (e) { (results[v] ||= {}).crash = String(e).slice(0, 300); }
  for (const [k, val] of Object.entries(results[v])) console.log(`${v.padEnd(7)} ${k}:`, JSON.stringify(val));
  console.log('');
}
await browser.close(); srv.close();
await rm(COPY, { recursive: true, force: true });

const o = results.owner, p = results.patched, fails = [];
const want = (c, m) => { if (!c) fails.push(m); };
want(o.step1 && !o.step1.demo && /борд/.test(o.step1.bubble || ''), 'owner: noBoard bubble');
want(o.typeofs && NAMES.every(n => o.typeofs[n] === 'undefined'), 'owner: all names undefined');
want(p.typeofs && NAMES.every(n => p.typeofs[n] !== 'undefined'), 'patched: all names defined');
want(p.step1?.demo, 'patched: demo note on step 1');
want(p.steps?.length === 6, 'patched: six command steps');
want(p.afterEnd && p.afterEnd.demoEls === 0 && p.afterEnd.demoData === 0 && p.afterEnd.idbDemo === 0 && p.afterEnd.notesData === p.afterEnd.bootNotes && !p.afterEnd.fullscreen && !p.afterEnd.modals.length, 'patched: no trace after end');
for (const [v, r] of [['owner', o], ['patched', p]]) {
  want(r.tableWork?.tableBtnActive, v + ': table-work step 1 edit mode with ▦ active');
  want(r.plain && r.plain.length > 20, v + ': plain question answered');
  want(!r.pageerrors?.length && !r.crash, v + ': no page errors');
}
console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL OK');
process.exit(fails.length ? 1 : 0);
