// Вградена снимка (type=8) в ТЕКСТА на бележка - подравняване спрямо реда.
// Собственикът (23.10.2026): „бележката с текст Test for pics, изображение в текста на първия ред -
// излиза от горната граница почти цялата".
// Причината беше vertical-align: middle в style.css: рамката се центроваше по базовата линия на
// текста, значи висока снимка в първия ред излизаше НАД реда с текста - точно до горния ръб на
// картата, а при високи снимки и над него. Сега рамката е vertical-align: top и расте надолу.
// Проверява се по ИСТИНСКИЯ път на картата (createNoteElement) с истинска разредка в браузър,
// не по пресметнато правило:
//   - снимка в първия ред: горният ѝ ръб не е над реда с текста и не е над горния ръб на текста;
//   - снимка в началото на първия ред: същото;
//   - снимка на втория ред: не застъпва реда над себе си;
//   - снимка на цялата ширина, която се пренася на нов ред: стои под текста, не над него;
//   - висока снимка (по-висока от текста на картата): горният ѝ ръб е в текста на бележката,
//     картата не е превъртяна (scrollTop 0), значи снимката не е изтикана нагоре.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-line-align.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = p === '/' ? 'index.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};

// --- Фалшив Drive: една широка (300x225) и една висока (300x600) снимка ---
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const TALL = 'file_0001.png';
const TALL_ID = 'FILE0001';
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const FILES = {
  [SMALL_ID]: { name: SMALL, w: 300, h: 225 },
  [TALL_ID]: { name: TALL, w: 300, h: 600 },
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    if (!FILES[fileId]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
  }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const q = new URL(url).searchParams.get('q') || '';
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
    if (name === 'multinotes_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: DATA_FOLDER, name: 'multinotes_data' }] }) });
    const hit = Object.entries(FILES).find(([, f]) => f.name === name);
    if (hit) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: hit[0], name, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const fileId = decodeURIComponent(url.replace('https://thumb.invalid/', '').replace(/=s\d+$/, ''));
    const f = FILES[fileId] || { w: 300, h: 225 };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}"><rect width="${f.w}" height="${f.h}" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); } } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
  localStorage.setItem('language', 'bg');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof createNoteElement === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

const pathOf = (f) => '/storage/emulated/0/Pictures/Images/' + f;
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');

// Промяна на 23.10.2026 (втори доклад на собственика): редът с думи И снимка вече е ЗАГЛАВИЕ на
// картата - думите отиват в заглавието, а снимката остава в тялото. Затова тук текстът на първия ред
// става заглавие, а редът под него дава ТЕКСТ, спрямо който се мери снимката. Точно това вижда и
// собственикът: „Test for pics" като заглавие и снимката под него, а не над картата.
const CASES = [
  // „Test for pics" + снимка на същия ред, 30% ширина, и ред текст под него.
  { key: 'first-line-pct30', raw: 'Test for pics *\nОще един ред текст', file: SMALL, pct: 3 },
  // Същото, но снимката е в НАЧАЛОТО на реда.
  { key: 'img-first-pct30', raw: '* Test for pics\nОще един ред текст', file: SMALL, pct: 3 },
  // Снимка на цялата ширина: не се побира след думите, значи се пренася на нов ред.
  { key: 'first-line-pct100', raw: 'Test for pics *\nОще един ред текст', file: SMALL, pct: 10 },
  // Снимка на свой ред: не бива да застъпва заглавието над себе си.
  { key: 'second-line-pct30', raw: 'Test for pics\n*\nОще един ред текст', file: SMALL, pct: 3 },
  // Висока снимка (600px) на същия ред като думите: горният ѝ ръб не бива да е над заглавието.
  { key: 'tall-first-line', raw: 'Test for pics *\nОще един ред текст', file: TALL, pct: 3 },
];
for (const c of CASES) {
  const at = c.raw.indexOf('*');
  c.format = fmt({ start: at, end: at + 1, type: 8, paramstring: pathOf(c.file), paramint: c.pct });
}

const built = await page.evaluate(async ({ cases }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  let host = document.getElementById('line-align-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'line-align-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:820px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;overflow:hidden;z-index:99999;background:#eee;padding:6px;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  for (const c of cases) {
    const id = 980000 + host.children.length;
    const nt = {
      alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'align' + id, id, notetxt: c.raw, numord: id, sellist: 0, status: 0,
      text_span: c.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    el.dataset.probeKey = c.key;
    host.appendChild(el);
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const frames = [...host.querySelectorAll('.nm-inline-img')];
    if (frames.length === cases.length && frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  return [...host.querySelectorAll('[data-probe-key]')].map(el => {
    const content = el.querySelector('.note-content');
    const frame = el.querySelector('.nm-inline-img');
    const card = el.getBoundingClientRect();
    const cr = content ? content.getBoundingClientRect() : null;
    const fr = frame ? frame.getBoundingClientRect() : null;
    // Първият ТЕКСТОВ възел с букви: по него се мери къде стои редът с текста.
    let line = null;
    if (content) {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let t = null;
      while (walker.nextNode()) { if (walker.currentNode.nodeValue.trim()) { t = walker.currentNode; break; } }
      if (t) {
        const r = document.createRange();
        r.setStart(t, 0); r.setEnd(t, Math.min(3, t.nodeValue.length));
        const rr = r.getBoundingClientRect();
        line = { top: Math.round(rr.top), bottom: Math.round(rr.bottom) };
      }
    }
    const titleEl = el.querySelector('.note-title-truncated, .note-title-wrapper');
    const tr = titleEl && titleEl.getBoundingClientRect && titleEl.getBoundingClientRect().height ? titleEl.getBoundingClientRect() : null;
    return {
      key: el.dataset.probeKey,
      title: tr ? { top: Math.round(tr.top), bottom: Math.round(tr.bottom) } : null,
      state: frame ? frame.dataset.nmState : null,
      card: { top: Math.round(card.top), bottom: Math.round(card.bottom) },
      content: cr ? { top: Math.round(cr.top), bottom: Math.round(cr.bottom), scrollTop: content.scrollTop, scrollH: content.scrollHeight, clientH: content.clientHeight } : null,
      frame: fr ? { top: Math.round(fr.top), bottom: Math.round(fr.bottom), w: Math.round(fr.width), h: Math.round(fr.height), verticalAlign: getComputedStyle(frame).verticalAlign } : null,
      line,
    };
  });
}, { cases: CASES });

const by = Object.fromEntries(built.map(r => [r.key, r]));

for (const r of built) {
  ok(r.frame && r.frame.w > 0 && r.frame.h > 0, `${r.key}: снимката е заредена и има размери`, r.frame);
  ok(r.frame && r.content && r.frame.top >= r.content.top - 1,
    `${r.key}: горният ръб на снимката не е над текста на бележката (${r.frame && r.content ? r.frame.top - r.content.top : '?'}px)`, r);
  ok(r.content && r.content.scrollTop === 0, `${r.key}: бележката не е превъртяна (scrollTop 0)`, r.content);
}

// Снимка от реда-заглавие: думите са в заглавието, а снимката е в тялото - значи започва ПОД
// заглавието, не над него и не над горния ръб на картата.
for (const key of ['first-line-pct30', 'img-first-pct30', 'tall-first-line']) {
  const r = by[key];
  if (!r || !r.frame || !r.title) { ok(false, `${key}: има рамка и заглавие`, r); continue; }
  const d = r.frame.top - r.title.bottom;
  ok(d >= -1, `${key}: снимката започва под заглавието, не над него (${d}px)`, r);
  ok(!!r.line, `${key}: под снимката има ред с текст в тялото`, r);
}

// Снимка на втория ред: първият ред (без снимка) става ЗАГЛАВИЕ на картата, а снимката остава
// в тялото - значи трябва да е ПОД заглавието, а не да го застъпва.
{
  const r = by['second-line-pct30'];
  ok(r && r.title && r.frame && r.frame.top >= r.title.bottom - 1,
    `second-line-pct30: снимката е под заглавието на картата (${r && r.frame && r.title ? r.frame.top - r.title.bottom : '?'}px)`, r);
}

// Снимка на цялата ширина: думите отиват в заглавието, снимката е в началото на тялото, а редът
// текст под нея остава под снимката.
{
  const r = by['first-line-pct100'];
  ok(r && r.frame && r.title && r.frame.top >= r.title.bottom - 1,
    `first-line-pct100: снимката стои под заглавието (${r && r.frame && r.title ? r.frame.top - r.title.bottom : '?'}px)`, r);
  ok(r && r.frame && r.line && r.line.top >= r.frame.bottom - 1,
    `first-line-pct100: редът текст стои под снимката (${r && r.frame && r.line ? r.line.top - r.frame.bottom : '?'}px)`, r);
}

ok(errs.length === 0, 'няма грешки в конзолата', errs.slice(0, 3));
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILED');

const SHOTS = process.env.SHOTS || '';
if (SHOTS) await page.locator('#line-align-host').screenshot({ path: SHOTS });
await browser.close();
srv.close();
process.exit(fails === 0 ? 0 : 1);
