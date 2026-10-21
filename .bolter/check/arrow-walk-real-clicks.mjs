// Стрелките при няколко отворени прозореца, с истински кликове на мишката.
//
// Договорът, който се проверява тук:
// 1) повторни натискания в ЕДНА И СЪЩА стрелка минават през всички отворени прозорци по реда на
//    отваряне и се завъртат - включително когато между тях минава повече от
//    NOTE_WINDOW_WALK_IDLE (1200 мс) и обхождането се строи наново;
// 2) натиск върху стрелката на ДРУГ прозорец тръгва от него (съзнателен избор);
// 3) „<“ върви по същия ред назад.
// Точно точка 1 се чупеше: стрелката прави своя прозорец активен още на pointerdown и
// обхождането тръгваше от него, тоест всеки бавен натиск в бележка 1 стигаше само до бележка 2.
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.gapi = { load() { }, client: { setToken() { }, getToken() { return { access_token: 'tok' }; }, drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } } } };
  window.showDirectoryPicker = undefined;
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof getOpenNoteWindows === 'function', null, { timeout: 20000 });
await page.evaluate(() => {
  localStorage.removeItem('singleNoteMode');
  notesContainer = document.getElementById('notes-container');
  searchBox = document.getElementById('search-box');
  if (typeof initNoteWindows === 'function') initNoteWindows();
  for (let i = 1; i <= 4; i++) showModal({ raw: 'бележка ' + i, format: null, id: 'L' + i, gdid: 'GL' + i, boardId: '' });
});
await page.waitForTimeout(900);

const state = () => page.evaluate(() => ({
  open: getOpenNoteWindows().length,
  active: getOpenNoteWindows().indexOf(activeNoteWindow),
}));
const arrowPos = (idx, which) => page.evaluate(({ idx, which }) => {
  const w = getOpenNoteWindows()[idx];
  const b = w.el.querySelector(which === '<' ? '#prev-note-btn,[data-mwid="prev-note-btn"]' : '#next-note-btn,[data-mwid="next-note-btn"]');
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), shown: b.style.display !== 'none' && r.width > 0 };
}, { idx, which });
const click = async (idx, which) => {
  const pos = await arrowPos(idx, which);
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(150);
  return { shown: pos.shown, ...(await state()) };
};

const start = await state();
ok(start.open === 4, 'четири отворени прозореца', 'отворени: ' + start.open);

// --- „>“ шест пъти в СЪЩАТА стрелка, с пауза над NOTE_WINDOW_WALK_IDLE
console.log('\n„>“ шест пъти, пауза 1400 мс, винаги стрелката на първия прозорец:');
const next = [];
for (let i = 0; i < 6; i++) {
  const s = await click(0, '>');
  ok(s.shown, `натиск ${i + 1}: стрелката на w0 се вижда`);
  next.push(s.active);
  await page.waitForTimeout(1250);
}
// първият натиск тръгва от самата натисната стрелка: w0 → w1
ok(next[0] === 1, 'първият натиск тръгва от натиснатата стрелка (w0 → w1)', 'получено w' + next[0]);
for (let i = 1; i < next.length; i++) {
  ok(next[i] === (next[i - 1] + 1) % 4, `натиск ${i + 1}: w${next[i - 1]} → w${(next[i - 1] + 1) % 4}`, 'получено w' + next[i]);
}
ok(new Set(next).size === 4, 'шестте бавни натиска минават през всичките четири прозореца', next.join(','));

// --- същата стрелка, но назад
console.log('\n„<“ шест пъти, пауза 1400 мс, винаги стрелката на първия прозорец:');
const back = [];
for (let i = 0; i < 6; i++) {
  const s = await click(0, '<');
  ok(s.shown, `натиск ${i + 1}: лявата стрелка на w0 се вижда`);
  back.push(s.active);
  await page.waitForTimeout(1250);
}
// последният натиск от предишната част остави w2, значи назад тръгва от него
ok(back[0] === (next[next.length - 1] - 1 + 4) % 4, 'първият натиск назад продължава от последния прозорец',
  'получено w' + back[0]);
for (let i = 1; i < back.length; i++) {
  ok(back[i] === (back[i - 1] - 1 + 4) % 4, `натиск ${i + 1}: w${back[i - 1]} → w${(back[i - 1] - 1 + 4) % 4}`, 'получено w' + back[i]);
}
ok(new Set(back).size === 4, 'шестте натиска назад минават през всичките четири', back.join(','));

// --- бързи натиски в същата стрелка
console.log('\n„>“ пет пъти, пауза 250 мс:');
const fast = [];
for (let i = 0; i < 5; i++) {
  fast.push((await click(0, '>')).active);
  await page.waitForTimeout(180);
}
for (let i = 1; i < fast.length; i++) {
  ok(fast[i] === (fast[i - 1] + 1) % 4, `бърз натиск ${i + 1}: w${fast[i - 1]} → w${(fast[i - 1] + 1) % 4}`, 'получено w' + fast[i]);
}

// --- натискане без мишка: клавиатура (Enter върху фокусирана стрелка) и програмно натискане
// пращат click без pointerdown. Тогава "предишният" прозорец се запомня в click фазата и
// обхождането пак трябва да върви напред, вместо да заседне на втория прозорец.
console.log('\nнатискания без pointerdown (програмно), пауза 1400 мс:');
const synthetic = [];
for (let i = 0; i < 5; i++) {
  synthetic.push(await page.evaluate(() => {
    const w = getOpenNoteWindows()[0];
    w.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]').click();
    return getOpenNoteWindows().indexOf(activeNoteWindow);
  }));
  await page.waitForTimeout(1400);
}
for (let i = 1; i < synthetic.length; i++) {
  ok(synthetic[i] === (synthetic[i - 1] + 1) % 4,
    `натиск ${i + 1} без pointerdown: w${synthetic[i - 1]} → w${(synthetic[i - 1] + 1) % 4}`,
    'получено w' + synthetic[i]);
}

// --- натиск върху стрелката на ДРУГ (неактивен) прозорец тръгва от него.
// Прозорците са fullscreen overlay-и, тоест с мишка може да се натисне само стрелката на предния
// прозорец; пътят за неактивен прозорец се проверява програмно, както го прави и multinotes.mjs.
console.log('\nнатиск върху стрелката на неактивен прозорец:');
const otherMoved = await page.evaluate(() => {
  const open = getOpenNoteWindows();
  activateNoteWindow(open[1], true);
  const before = getOpenNoteWindows().indexOf(activeNoteWindow);
  const btn = open[3].el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  if (btn) btn.click();
  return { before, after: getOpenNoteWindows().indexOf(activeNoteWindow), open: getOpenNoteWindows().length };
});
ok(otherMoved.open === 4 && otherMoved.after === (3 + 1) % 4,
  `натиск в w3 води до w${(3 + 1) % 4}`, JSON.stringify(otherMoved));

// --- два прозореца: сменят се и зациклят
console.log('\nпри два прозореца:');
await page.evaluate(() => {
  let guard = 0;
  while (getOpenNoteWindows().length > 2 && guard++ < 20) {
    const open = getOpenNoteWindows();
    closeNoteWindow(open[open.length - 1]);
  }
});
await page.waitForTimeout(400);
const two = await state();
ok(two.open === 2, 'остават два отворени', 'отворени: ' + two.open);
const pair = [];
for (let i = 0; i < 4; i++) {
  pair.push((await click(0, '>')).active);
  await page.waitForTimeout(250);
}
for (let i = 1; i < pair.length; i++) {
  ok(pair[i] !== pair[i - 1], `натиск ${i + 1}: сменя прозореца (w${pair[i - 1]} → w${pair[i]})`);
}
ok(new Set(pair).size === 2, 'двата прозореца се редуват', pair.join(','));

ok(errors.length === 0, 'нула грешки в страницата', errors.join(' | '));

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass}/${pass + fail}`);
await browser.close();
srv.close();
process.exit(fail === 0 ? 0 : 1);
