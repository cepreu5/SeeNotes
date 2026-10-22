// Настройката „Графичен фон (бележка)" (ключ imgBgrd) трябва да е ИЗКЛЮЧЕНА по подразбиране,
// тоест при първо стартиране, когато ключът го няма в localStorage, бележката се отваря на
// обикновен фон. Явно записаното 'true' пак включва графичния фон, а 'false' го изключва.
// Старото поведение беше обратното: `!== 'false'` значеше включено при липсващ ключ.
// Всяка от трите проверки е в отделен контекст (истинско първо стартиране), не се преизползва
// вече отворена бележка - иначе вторият showModal влиза в друг прозорец.
// Пуска се от корена на хранилището:  node .bolter/check/img-bgrd-default-off.mjs
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const PAGE = 'index.html'; // cx-notes: приложението е в uni/index.html
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? PAGE : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); if (!cond) fails++; };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

// initial: null = ключът липсва (първо стартиране), иначе записаната стойност.
const runPhase = async (initial) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((value) => {
    try {
      if (value === null) localStorage.removeItem('imgBgrd');
      else localStorage.setItem('imgBgrd', value);
    } catch { }
  }, initial);
  await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (url.startsWith('https://accounts.google.com/gsi/client')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
    }
    // Ko-fi джаджата на лендинга: без нея main хвърля "kofiWidgetOverlay is not defined".
    if (url.startsWith('https://storage.ko-fi.com/')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  const page = await ctx.newPage();
  // Гидът на демо-тура слага речта си върху бележката; проверката не е за него.
  await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt|msmrtt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
  await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
  await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

  const key = await page.evaluate(() => localStorage.getItem('imgBgrd'));

  // Бележката се отваря през истинския showModal; гледаме кутията на активния прозорец.
  const note = await page.evaluate(async () => {
    await showModal({ raw: 'Тест|Тяло на бележката', format: null, id: 'bg-probe' }, null);
    await new Promise(r => setTimeout(r, 600));
    let win = null;
    if (typeof getOpenNoteWindows === 'function') { const open = getOpenNoteWindows(); win = open[open.length - 1] || null; }
    if (!win && typeof activeNoteWindow !== 'undefined') win = activeNoteWindow;
    const box = (win && win.box) || document.querySelector('.modal-content-box');
    if (!box) return { found: false };
    return {
      found: true,
      noBg: box.classList.contains('no-bg-image'),
      image: getComputedStyle(box).backgroundImage,
      inline: box.style.backgroundImage,
    };
  });

  // Квадратчето в Настройки се инициализира от същия ключ (както в onetap-persist).
  const box = await page.evaluate(async () => {
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    if (typeof createSettingsUI !== 'function') return { ui: false };
    try { await createSettingsUI([], false); } catch (e) { return { ui: false, error: String(e.message).slice(0, 200) }; }
    await new Promise(r => setTimeout(r, 300));
    const cb = document.getElementById('img-bgrd-checkbox');
    return cb ? { ui: true, checked: cb.checked } : { ui: false };
  });

  await ctx.close();
  return { key, note, box, errs };
};

// --- 1. Първо стартиране: ключът липсва => графичният фон е изключен ---
const off = await runPhase(null);
ok(off.key === null, `първо стартиране: ключът imgBgrd липсва (${off.key})`, off);
ok(off.note.found, 'бележката се отвори', off.note);
ok(off.note.noBg === true, 'липсващ ключ: бележката е с клас no-bg-image', off.note);
ok(off.note.inline === 'none' && off.note.image === 'none', `липсващ ключ: фонът е none (inline=${off.note.inline}, изчислен=${off.note.image})`, off.note);
ok(off.box.ui === true && off.box.checked === false, 'липсващ ключ: квадратчето „Графичен фон (бележка)" е изключено', off.box);
ok(off.errs.length === 0, `липсващ ключ: няма грешки в страницата (${off.errs.length})`, off.errs);

// --- 2. Явно включване: 'true' връща графичния фон ---
const on = await runPhase('true');
ok(on.note.found, 'imgBgrd=true: бележката се отвори', on.note);
ok(on.note.noBg === false, 'imgBgrd=true: класът no-bg-image го няма', on.note);
ok(/Note\.jpg/.test(on.note.image), `imgBgrd=true: фонът е Note.jpg (${on.note.image})`, on.note);
ok(on.box.ui === true && on.box.checked === true, 'imgBgrd=true: квадратчето е отметнато', on.box);

// --- 3. Явно изключване: 'false' остава изключено ---
const hard = await runPhase('false');
ok(hard.note.found, 'imgBgrd=false: бележката се отвори', hard.note);
ok(hard.note.noBg === true && hard.note.image === 'none', `imgBgrd=false: фонът пак е none`, hard.note);
ok(hard.box.ui === true && hard.box.checked === false, 'imgBgrd=false: квадратчето е празно', hard.box);

await browser.close();
srv.close();
console.log(fails === 0 ? `\nALL PASS (${n} проверки)` : `\nFAILED ${fails}/${n}`);
process.exit(fails === 0 ? 0 : 1);
