// Жива проверка в продукционния билд (Beta/): водачът „Допълнителни команди“ (Ctrl-actions), пуснат като от потребител -
// въпрос към асистента + бутона „Покажи ми“; после table-work стъпка 1 и обикновен въпрос. От корена на репото:
//   node .bolter/check/assistant-ctrl-actions.mjs <tag>        (снимки .bolter/check/assistant-ctrl-actions-<tag>.png)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, cp, rm } from 'node:fs/promises';
import { join, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PW || '/opt/nvm/versions/node/v22.23.2/lib/node_modules/playwright/index.js');
const TAG = process.argv[2] || 'run';
// Копие на Beta/ в дървото на проекта (не в /tmp), за да се сервира точно текущото съдържание
const ROOT = join('.bolter/check/.beta-copy');
await rm(ROOT, { recursive: true, force: true }); await cp('Beta', ROOT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try { const b = await readFile(join(ROOT, p.endsWith('/') ? p + 'index.html' : p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8767);
const DEMO = '.note[data-i="guide-demo-note"]';
const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const log = [];
await ctx.route(u => !u.href.startsWith('http://localhost:8767/'), r => r.abort());
page.on('console', m => log.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', e => log.push('[pageerror] ' + e.message));
const relevant = () => log.filter(l => /not found|pageerror|\[error\]|Guide|demo|Clicking/i.test(l) && !/Failed to load resource|ERR_FAILED/.test(l));

await page.goto('http://localhost:8767/index.html');
await page.evaluate(() => { localStorage.setItem('language', 'bg'); localStorage.setItem('guide', 'false'); localStorage.setItem('app_version_seen', 'Beta 9.99'); localStorage.setItem('google_auth_token', 'fake-token-for-local-test'); });
await page.goto('http://localhost:8767/index.html');
await page.waitForFunction(() => document.body.classList.contains('app-ready'));
await page.evaluate(() => { const lp = document.getElementById('login-page'); if (lp) { lp.hidden = true; lp.style.display = 'none'; } });

const ask = async q => {
  await page.evaluate(q => { const i = document.getElementById('kb-input'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('kb-send-btn').click(); }, q);
  await page.waitForFunction(q => { const m = [...document.querySelectorAll('#kb-chat-messages > *')]; const i = m.findIndex(e => e.innerText.includes(q)); return i >= 0 && i < m.length - 1; }, q, { timeout: 5000 }).catch(() => { });
  return page.evaluate(q => { const m = [...document.querySelectorAll('#kb-chat-messages > *')]; const i = m.findLastIndex(e => e.innerText.includes(q)); return m.slice(i + 1).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 110)).join(' | '); }, q);
};
const openKb = async () => {
  await page.evaluate(() => { if (!window.kbUI) document.getElementById('kb-fab').click(); else if (!window.kbUI.isOpen) window.kbUI.open(); });
  await page.waitForFunction(() => window.kbUI?.isOpen && window.kbAssistant?.isInitialized, null, { timeout: 10000 })
    .catch(async e => { console.log('openKb state', JSON.stringify(await page.evaluate(() => ({ open: window.kbUI?.isOpen, init: window.kbAssistant?.isInitialized, fab: getComputedStyle(document.getElementById('kb-fab')).display, same: window.kbUI === window.kbAssistant?.ui })))); throw e; });
};

await openKb();
const engine = await page.evaluate(() => ({
  guideDemoNote: typeof window.guideDemoNote, guideDemoReset: typeof window.guideDemoReset, guideDemoDiscard: typeof window.guideDemoDiscard,
  boardsDataGlobal: typeof boardsData, allNotesDataGlobal: typeof allNotesData, createNoteElementGlobal: typeof createNoteElement,
  assistantHasDemoNote: String(window.kbAssistant.showGuide).includes('demoNote'),
}));
console.log('ENGINE', JSON.stringify(engine));

// ---------- Ctrl-actions: въпрос + „Покажи ми“ ----------
log.length = 0;
console.log('ANSWER Ctrl-actions:', JSON.stringify(await ask('Допълнителни команди')));
const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('.kb-show-me-btn')].pop(); if (!b) return null; const g = JSON.parse(b.dataset.guide); return { id: g.id ?? null, step1action: g['1']?.action }; });
console.log('SHOW-ME button', JSON.stringify(btn));
await page.evaluate(() => [...document.querySelectorAll('.kb-show-me-btn')].pop().click());
await page.waitForFunction(() => document.querySelector('.guide-container .speech-bubble'), null, { timeout: 5000 }).catch(() => { });
await page.waitForFunction(DEMO => document.querySelector(DEMO), DEMO, { timeout: 2500 }).catch(() => { });
const s1 = await page.evaluate(DEMO => ({
  demoNote: !!document.querySelector(DEMO), guide: !!document.querySelector('.guide-container'),
  bubble: document.querySelector('.guide-container .speech-bubble')?.innerText.slice(0, 140) || null,
}), DEMO);
await page.screenshot({ path: `.bolter/check/assistant-ctrl-actions-${TAG}.png` });
console.log('CTRL step1', JSON.stringify(s1));
console.log('CTRL log', JSON.stringify(relevant()));
// ако демото тръгне: минаваме стъпките с „напред“ на водача и накрая проверяваме, че бележката е изчезнала
if (s1.demoNote) {
  const trace = [];
  for (let i = 2; i <= 8; i++) {
    const r = await page.evaluate(() => { const n = document.querySelector('.guide-container .guide-next, .guide-container [data-action="next"]'); if (n) { n.click(); return true; } return false; });
    await page.waitForTimeout(700);
    trace.push(await page.evaluate(DEMO => ({ demo: !!document.querySelector(DEMO), cal: !!document.querySelector(DEMO + ' .note-week-calendar'), clock: !!document.querySelector(DEMO + ' .clock'), pinned: !!document.querySelector(DEMO)?.classList.contains('note-pinned'), guide: !!document.querySelector('.guide-container') }), DEMO));
    if (!r) break;
  }
  console.log('CTRL trace', JSON.stringify(trace));
}
await page.evaluate(() => window.kbAssistant.terminateGuide?.());
await page.waitForTimeout(300);
console.log('CTRL after terminate', JSON.stringify(await page.evaluate(DEMO => ({ demoNote: document.querySelectorAll(DEMO).length, guide: !!document.querySelector('.guide-container') }), DEMO)));

// ---------- table-work стъпка 1 ----------
log.length = 0;
await openKb();
console.log('ANSWER table-work:', JSON.stringify(await ask('Как се работи с таблица в бележка?')));
// бутонът „Покажи ми“ на записа table-work: стъпка 1 е action "note" с editTable
const twBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('.kb-show-me-btn')].filter(b => JSON.parse(b.dataset.guide)['1']?.editTable).pop(); if (b) b.click(); return !!b; });
console.log('TABLE-WORK show-me clicked', twBtn);
await page.waitForFunction(() => document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table.is-active'), null, { timeout: 5000 }).catch(() => { });
console.log('TABLE-WORK step1', JSON.stringify(await page.evaluate(() => ({
  modal: !!document.getElementById('content-modal')?.classList.contains('visible'),
  tableBtnActive: !!document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table.is-active'),
  textarea: !!document.querySelector('#modal-body textarea'),
}))));
console.log('TABLE-WORK log', JSON.stringify(relevant()));
await page.evaluate(() => window.kbAssistant.terminateGuide?.());

// ---------- обикновен въпрос ----------
await page.evaluate(() => document.getElementById('content-modal')?.classList.remove('visible'));
await openKb();
console.log('ANSWER plain:', JSON.stringify(await ask('Как да създам нова бележка?')));
console.log('PAGEERRORS', JSON.stringify(log.filter(l => l.startsWith('[pageerror]'))));
await browser.close(); srv.close();
await rm(ROOT, { recursive: true, force: true });
