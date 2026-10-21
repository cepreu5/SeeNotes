// Проверка по съобщението на собственика (2026-10-21 16:46 UTC):
//   четири отворени прозореца, стрелката ">" се натиска МНОГОКРАТНО в ПЪРВИЯ прозорец,
//   както го прави човек. Всеки натиск трябва да активира СЛЕДВАЩИЯ прозорец (1→2→3→4→1),
//   а не да стои на втория.
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
    },
  };
  window.showDirectoryPicker = undefined;
});
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof getOpenNoteWindows === 'function', null, { timeout: 20000 });

await page.evaluate(() => {
  localStorage.setItem('lang', currentLang || 'bg');
  localStorage.removeItem('singleNoteMode');
  notesContainer = document.getElementById('notes-container');
  searchBox = document.getElementById('search-box');
  saveSearchBtn = document.getElementById('save-search-btn') || document.createElement('button');
  if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
  initNoteWindows();
  if (typeof removeGuide === 'function') removeGuide();
  document.querySelectorAll('.guide-container').forEach(el => el.remove());
});

const openNote = async (i) => {
  await page.evaluate((i) => showModal({ raw: 'бележка ' + i, format: null, id: 'L' + i, gdid: 'GL' + i, boardId: 'B1' }), i);
  await page.waitForFunction((n) => getOpenNoteWindows().length === n, i, { timeout: 8000 });
};
const activeText = () => page.evaluate(() => (activeNoteWindow ? (activeNoteWindow.body.textContent || '').trim() : null));

// Координати на стрелката в ПЪРВИЯ отворен прозорец (не в активния).
const arrowOf = (index, dir) => page.evaluate(({ index, dir }) => {
  const win = getOpenNoteWindows()[index];
  const btn = win.el.querySelector(dir > 0 ? '#next-note-btn, [data-mwid="next-note-btn"]' : '#prev-note-btn, [data-mwid="prev-note-btn"]');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), display: getComputedStyle(btn).display };
}, { index, dir });

await openNote(1); await openNote(2); await openNote(3); await openNote(4);
await page.evaluate(() => activateNoteWindow(getOpenNoteWindows()[0], true));
await page.waitForTimeout(150);

// Балончето на продуктовия тур (.speech-bubble) изскача при чиста инсталация, ляга над прозорците
// и гълта клика — махаме го преди всеки натиск, за да мерим само обхождането.
const clearTour = () => page.evaluate(() => {
  if (typeof removeGuide === 'function') removeGuide();
  document.querySelectorAll('.guide-container, .speech-bubble').forEach(el => el.remove());
});

const forward = [];
for (let i = 0; i < 6; i++) {
  await clearTour();
  const where = await arrowOf(0, 1);
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(140);
  forward.push(await activeText());
}

const backward = [];
for (let i = 0; i < 4; i++) {
  await clearTour();
  const where = await arrowOf(0, -1);
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(140);
  backward.push(await activeText());
}

const expect = ['бележка 2', 'бележка 3', 'бележка 4', 'бележка 1', 'бележка 2', 'бележка 3'];
// Назадът продължава оттам, докъдето е стигнал напредът (бележка 3, позиция 2): 2 → 1 → 4 → 3.
const expectBack = ['бележка 2', 'бележка 1', 'бележка 4', 'бележка 3'];
// Изчакване над NOTE_WINDOW_WALK_IDLE: поредицата се строи наново и тръгва от натиснатия прозорец.
await page.waitForTimeout(1500);
const afterIdle = [];
for (let i = 0; i < 2; i++) {
  await clearTour();
  const where = await arrowOf(0, 1);
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(140);
  afterIdle.push(await activeText());
}

const result = {
  forward, forwardOk: JSON.stringify(forward) === JSON.stringify(expect),
  backward, backwardOk: JSON.stringify(backward) === JSON.stringify(expectBack),
  afterIdle, afterIdleOk: JSON.stringify(afterIdle) === JSON.stringify(['бележка 2', 'бележка 3']),
  openCount: await page.evaluate(() => getOpenNoteWindows().length),
};
result.ALL_PASS = result.forwardOk && result.backwardOk && result.afterIdleOk && result.openCount === 4;
console.log(JSON.stringify(result, null, 2));
await browser.close();
srv.close();
process.exit(result.ALL_PASS ? 0 : 1);
