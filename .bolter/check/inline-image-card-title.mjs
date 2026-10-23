// Заглавието на картата, когато бележката има вградена снимка (type=8) - план 10, cx-notes.
// Собственикът (23.10.2026): „ред със снимка не става заглавие, картата показва снимката в тялото.
// Заглавие се взима само от ред без вграден маркер, а бележка само със снимка остава без заглавие."
// Проверява се по истинския път на картата (createNoteElement), не по пресметнато правило:
//   - бележка само със снимка: заглавие НЯМА (нито „...", нито знака на маркера) и е скрито,
//     а снимката стои в тялото на картата;
//   - първи ред снимка, втори ред дума: заглавието е думата от втория ред, а снимката пак е в тялото;
//   - текст и снимка на ЕДИН ред: този ред не става заглавие - картата показва снимката в тялото;
//   - празна бележка без снимки пази днешното „...";
//   - редът с датата и часа си остава както е.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-card-title.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

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
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const SHOTS = process.env.SHOTS || '';

// --- Фалшив Drive: папка Images с една малка снимка (300px) ---
const DRIVE = { list: [], thumb: [] };
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const SMALL = 'file_0000.png';
const SMALL_ID = 'FILE0000';
const WIDE = 300;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    DRIVE.thumb.push(fileId);
    if (fileId !== SMALL_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
  }
  if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
    const u = new URL(url);
    const q = u.searchParams.get('q') || '';
    DRIVE.list.push(q);
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
    }
    if (name === 'multinotes_data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: DATA_FOLDER, name: 'multinotes_data' }] }) });
    if (name === SMALL) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: SMALL_ID, name: SMALL, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDE}" height="225"><rect width="${WIDE}" height="225" fill="#c6d2e4"/></svg>`;
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
      drive: {
        files: {
          list() { return Promise.resolve({ result: { files: [] } }); },
          get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); },
        },
      },
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

// --- Бележките: маркерът '*' е снимката, точно както стои в текста на бележката ---
const IMG = '/storage/emulated/0/Pictures/Images/' + SMALL;
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const star = (i) => i; // маркерът стои на мястото на звездичката

const CASES = [
  {
    // Само снимка: няма ред без маркер, значи няма заглавие.
    key: 'only',
    raw: '*',
    format: fmt(span8(0, 1, IMG, 3)),
    wantTitle: '',
    wantHidden: true,
    wantImage: true,
  },
  {
    // Първи ред - снимка, втори - дума: заглавието е думата, а снимката остава в тялото.
    key: 'img-then-word',
    raw: '*\nНачалният екран',
    format: fmt(span8(0, 1, IMG, 3)),
    wantTitle: 'Началният екран',
    wantHidden: false,
    wantImage: true,
  },
  {
    // Текст И снимка на един ред: този ред не става заглавие - картата показва снимката в тялото.
    key: 'text-and-img',
    raw: 'Кратка бележка * тук\nДолният ред е заглавие',
    format: fmt(span8(15, 16, IMG, 3)),
    wantTitle: 'Долният ред е заглавие',
    wantHidden: false,
    wantImage: true,
  },
  {
    // Един ред с текст и снимка и нищо друго: заглавие няма, но „..." също не бива да излиза.
    key: 'one-line-mixed',
    raw: 'Кратка бележка * тук',
    format: fmt(span8(15, 16, IMG, 3)),
    wantTitle: '',
    wantHidden: true,
    wantImage: true,
  },
  {
    // Празна бележка без снимки: днешното „..." остава.
    key: 'empty',
    raw: '   ',
    format: '',
    wantTitle: '...',
    wantHidden: false,
    wantImage: false,
  },
  {
    // Бележка от тип 1 (markdown): правилото е същото - редът със снимка не става заглавие.
    key: 'markdown-img-first',
    raw: '*\n**Началният екран**',
    format: fmt(span8(0, 1, IMG, 3)),
    type: 1,
    wantTitle: 'Началният екран',
    wantHidden: false,
    wantImage: true,
  },
  {
    // Обикновена бележка със снимка на ВТОРИЯ ред: заглавието е първият ред, снимката е в тялото.
    key: 'plain-then-img',
    raw: 'Обикновена бележка\n*\nи още текст',
    format: fmt(span8('Обикновена бележка\n'.length, 'Обикновена бележка\n'.length + 1, IMG, 3)),
    wantTitle: 'Обикновена бележка',
    wantHidden: false,
    wantImage: true,
  },
];
for (const c of CASES) {
  // Маркерът трябва да стои точно на звездичката в текста - иначе проверката не мери нищо.
  const at = c.raw.indexOf('*');
  const span = c.format ? JSON.parse(c.format) : null;
  if (span && at >= 0) span.start = at, span.end = at + 1;
  c.format = span ? fmt(span) : '';
  c.starAt = at;
}

const built = await page.evaluate(async ({ cases, small }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  let host = document.getElementById('card-title-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'card-title-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:620px;height:800px;display:flex;flex-direction:column;gap:6px;overflow:hidden;z-index:99999;background:#fff;padding:6px;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const out = [];
  for (const c of cases) {
    const id = 950000 + out.length;
    const nt = {
      alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'card' + id, id, notetxt: c.raw, numord: id, sellist: 0, status: 0,
      text_span: c.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: c.type || 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    el.dataset.probeKey = c.key;
    host.appendChild(el);
  }
  // Снимките се теглят по мрежата: изчаква се всяка рамка да е готова (или да се провали).
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const frames = [...host.querySelectorAll('.nm-inline-img')];
    if (frames.length && frames.every(f => f.dataset.nmState && f.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => requestAnimationFrame(r));
  return [...host.querySelectorAll('.note[data-probe-key]')].map(el => {
    const titleEl = el.querySelector('.note-title-truncated');
    const content = el.querySelector('.note-content');
    const frame = content ? content.querySelector('.nm-inline-img[data-nm-file]') : null;
    const header = el.querySelector('.note-header-info');
    return {
      key: el.dataset.probeKey,
      title: titleEl ? titleEl.textContent : null,
      titleDisplay: titleEl ? getComputedStyle(titleEl).display : null,
      titleBox: titleEl ? Math.round(titleEl.getBoundingClientRect().height) : null,
      hasTitleEl: !!titleEl,
      header: !!header,
      headerText: header ? header.textContent.trim().slice(0, 24) : null,
      contentText: content ? content.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null,
      imgState: frame ? (frame.dataset.nmState || null) : null,
      imgPx: frame ? Math.round(frame.getBoundingClientRect().width) : null,
      imgPct: frame ? (frame.dataset.nmPct || null) : null,
      imgs: content ? content.querySelectorAll('.nm-inline-img[data-nm-file]').length : 0,
      markerChar: content ? (content.textContent.includes('*') ? 'star' : 'no-star') : null,
    };
  });
}, { cases: CASES, small: SMALL });

const byKey = {};
built.forEach(b => { byKey[b.key] = b; });
ok(built.length === CASES.length, `всичките ${CASES.length} карти се построиха (${built.map(b => b.key).join(', ')})`, built);

// --- 1. Бележка само със снимка: заглавие няма, снимката е в тялото ---
const only = byKey['only'];
ok(!!only && only.hasTitleEl, 'картата има елемент за заглавие (той се крие, не се маха)', only);
ok(!!only && only.title === '' && only.titleDisplay === 'none',
  `само снимка: НЯМА заглавие - нито знака на маркера, нито „...\" („${only && only.title}\", display ${only && only.titleDisplay})`, only);
ok(!!only && only.header === true && !!only.headerText,
  `редът с датата и часа си остава (${only && only.headerText})`, only);
ok(!!only && only.imgs === 1 && only.imgState === 'ready' && only.imgPx > 0,
  `снимката стои в тялото на картата (.note-content .nm-inline-img, ${only && only.imgPx}px)`, only);
ok(!!only && only.markerChar === 'no-star',
  `знакът на маркера не се вижда като текст на картата (${only && only.markerChar})`, only);

// --- 2. Първи ред снимка, втори ред дума ---
const iw = byKey['img-then-word'];
ok(!!iw && iw.title === 'Началният екран' && iw.titleDisplay !== 'none',
  `първи ред снимка, втори ред дума: заглавието е думата от втория ред („${iw && iw.title}\")`, iw);
ok(!!iw && iw.imgs === 1 && iw.imgState === 'ready',
  `и снимката пак се вижда в тялото, а не е изчезнала с изрязания ред (${iw && iw.imgs} рамка, ${iw && iw.imgState})`, iw);
ok(!!iw && iw.contentText === '' && iw.markerChar === 'no-star',
  `тялото не показва нито звездичката, нито текста на заглавието („${iw && iw.contentText}\")`, iw);

// --- 3. Текст и снимка на един ред ---
const mixed = byKey['text-and-img'];
ok(!!mixed && mixed.title === 'Долният ред е заглавие',
  `ред с текст И снимка не става заглавие - взима се следващият ред без снимка („${mixed && mixed.title}\")`, mixed);
ok(!!mixed && mixed.title !== 'Кратка бележка * тук' && mixed.imgs === 1 && mixed.imgState === 'ready',
  `картата показва снимката в тялото на този ред (${mixed && mixed.imgs} рамка, ${mixed && mixed.imgState})`, mixed);
ok(!!mixed && /Кратка бележка/.test(String(mixed.contentText)),
  `редът с текста и снимката остава в тялото („${mixed && mixed.contentText}\")`, mixed);

// --- 3б. Един ред с текст и снимка и нищо друго: без заглавие, но без „..." ---
const oneLine = byKey['one-line-mixed'];
ok(!!oneLine && oneLine.title === '' && oneLine.titleDisplay === 'none',
  `един ред с текст и снимка: картата остава без заглавие, а не с „...\" („${oneLine && oneLine.title}\")`, oneLine);
ok(!!oneLine && oneLine.imgs === 1 && /Кратка бележка/.test(String(oneLine.contentText)),
  `и снимката, и текстът са в тялото („${oneLine && oneLine.contentText}\")`, oneLine);

// --- 3в. Същото и за бележка от тип 1 (markdown) ---
const md = byKey['markdown-img-first'];
ok(!!md && md.title === 'Началният екран' && md.titleDisplay !== 'none',
  `бележка от тип 1: пак се взима редът без снимка, а не знакът на маркера („${md && md.title}\")`, md);
ok(!!md && md.imgs === 1 && md.imgState === 'ready',
  `и там снимката се вижда в тялото на картата (${md && md.imgs} рамка, ${md && md.imgState})`, md);

// --- 4. Празна бележка без снимки пази „..." ---
const empty = byKey['empty'];
ok(!!empty && empty.title === '...' && empty.titleDisplay !== 'none',
  `празна бележка без снимки пази днешното „...\" („${empty && empty.title}\")`, empty);
ok(!!empty && empty.imgs === 0, `в нея няма рамка на снимка (${empty && empty.imgs})`, empty);

// --- 5. Обикновена бележка със снимка на втория ред ---
const plain = byKey['plain-then-img'];
ok(!!plain && plain.title === 'Обикновена бележка' && plain.imgs === 1,
  `обикновена бележка: заглавието е първият ред, снимката е в тялото („${plain && plain.title}\", ${plain && plain.imgs} рамка)`, plain);
ok(!!plain && /и още текст/.test(String(plain.contentText)),
  `и останалият текст е в тялото („${plain && plain.contentText}\")`, plain);

// --- 6. Заглавие с явен разделител '|' продължава да печели ---
const piped = await page.evaluate(async () => {
  const host = document.getElementById('card-title-host');
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  // При явен разделител '|' записът (text_span) е в координати на ТЯЛОТО, не на целия текст.
  const raw = 'Явно заглавие|*\nпод него';
  const at = raw.substring(raw.indexOf('|') + 1).indexOf('*');
  const nt = {
    alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'cardPiped', id: 950900, notetxt: raw, numord: 950900, sellist: 0, status: 0,
    text_span: JSON.stringify({ start: at, end: at + 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/file_0000.png', paramint: 3 }),
    title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.style.display = 'flex';
  el.style.contentVisibility = 'visible';
  host.appendChild(el);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const f = el.querySelector('.nm-inline-img');
    if (f && f.dataset.nmState && f.dataset.nmState !== 'loading') break;
    await new Promise(r => setTimeout(r, 40));
  }
  const frame = el.querySelector('.note-content .nm-inline-img');
  return {
    title: el.querySelector('.note-title-truncated') ? el.querySelector('.note-title-truncated').textContent : null,
    imgState: frame ? (frame.dataset.nmState || null) : null,
    imgs: el.querySelectorAll('.note-content .nm-inline-img').length,
    contentText: el.querySelector('.note-content') ? el.querySelector('.note-content').textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null,
  };
});
ok(piped.title === 'Явно заглавие' && piped.imgs === 1 && piped.imgState === 'ready',
  `явният разделител '|' пак дава заглавието, а снимката е в тялото („${piped.title}\", ${piped.imgs} рамка)`, piped);

// --- 7. Линията с датата и часът не се пипат от скриването на заглавието ---
ok(!!only && only.header === true && built.every(b => b.header === true),
  `редът с датата и часа стои на всичките карти (${built.map(b => b.header).join(', ')})`, built);

if (SHOTS) await page.screenshot({ path: `${SHOTS}-card-titles.png`, fullPage: false });

// --- 8. Никакви грешки ---
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('Drive заявки: ' + JSON.stringify(DRIVE.list.slice(0, 10)));
  console.log('thumbnail заявки: ' + JSON.stringify(DRIVE.thumb.slice(0, 10)));
  console.log('състояния: ' + JSON.stringify(built));
}
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
