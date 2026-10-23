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


// Проверява двете неща от 23.10.2026:
//  1) картата се строи, ПРЕДИ да влезе в страницата (както прави бордът) - снимката пак трябва да се види;
//  2) прикачените файлове не избутват текста извън картата.
const res = await page.evaluate(async ({ small }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  localStorage.setItem('oneTapLink', 'true');
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  let host = document.getElementById('ovf-host');
  if (!host) {
    host = document.createElement('div'); host.id = 'ovf-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:260px;height:600px;display:flex;flex-direction:column;gap:8px;overflow:hidden;z-index:99999;background:#eee;padding:6px;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
  const SEED = [
    { key: 'detached', raw: 'Заглавие\nТекст * край', att: 0 },
    { key: 'detached-att', raw: 'Заглавие\nТекст * край', att: 2 },
  ];
  const built = [];
  for (const s of SEED) {
    const gd = 'ovf-' + s.key;
    const at = s.raw.indexOf('*');
    const nt = {
      alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: gd, id: 970000 + built.length, notetxt: s.raw, numord: 970000, sellist: 0, status: 0,
      text_span: JSON.stringify({ start: at, end: at + 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/' + small, paramint: 5 }),
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
    };
    if (s.att) {
      mediaData.push({ noteid: gd, path: small, pathGD: 'FILE0000', type: 1 });
      mediaData.push({ noteid: gd, path: 'voice.mp3', pathGD: 'SOUND9', type: 2, description: 'voice' });
    }
    const el = await createNoteElement(nt);   // строи се извън страницата, както на борда
    built.push({ key: s.key, el });
  }
  await new Promise(r => setTimeout(r, 1500)); // снимката има време да се реши, докато картата е откачена
  built.forEach(b => {
    b.el.style.display = 'flex'; b.el.style.contentVisibility = 'visible'; b.el.dataset.probeKey = b.key;
    host.appendChild(b.el);
  });
  await new Promise(r => setTimeout(r, 300));
  return built.map(b => {
    const c = b.el.querySelector('.note-content');
    const fr = c.querySelector('.nm-inline-img');
    const att = null;
    const noteBox = b.el.getBoundingClientRect();
    const attBox = att ? att.getBoundingClientRect() : null;
    const imgBox = fr ? fr.getBoundingClientRect() : null;
    const inside = (bx) => !!bx && bx.top >= noteBox.top - 1 && bx.bottom <= noteBox.bottom + 1 &&
      bx.left >= noteBox.left - 1 && bx.right <= noteBox.right + 1;
    return {
      key: b.key,
      imgState: fr ? (fr.dataset.nmState || null) : null,
      imgPx: fr ? Math.round(fr.getBoundingClientRect().width) : 0,
      imgs: c.querySelectorAll('.nm-inline-img').length,
      footerIcons: b.el.querySelectorAll('.note-footer .footer-icon').length,
      links: [...c.querySelectorAll('a')].map(a => a.textContent.trim()),
      attLinks: [], hasAttBlock: !!b.el.querySelector('.note-attachments'),
      imgInside: inside(imgBox),
      attInside: inside(attBox),
      contentText: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  });
}, { small: SMALL });
console.log('RES ' + JSON.stringify(res));
const geo = await page.evaluate(() => [...document.querySelectorAll('.note[data-probe-key]')].map(el => {
  const r = el.getBoundingClientRect();
  const pick = (sel) => { const x = el.querySelector(sel); if (!x) return null; const b = x.getBoundingClientRect();
    return { top: Math.round(b.top - r.top), bottom: Math.round(b.bottom - r.top), h: Math.round(b.height) }; };
  return { key: el.dataset.probeKey, noteH: Math.round(r.height), title: pick('.note-title-wrapper'),
    content: pick('.note-content'), att: pick('.note-attachments'), footer: pick('.note-footer'),
    wrapper: pick('.note-content-wrapper') };
}));
console.log('GEO ' + JSON.stringify(geo, null, 1));
const plain = res.find(r => r.key === 'detached');
const withAtt = res.find(r => r.key === 'detached-att');
ok(!!plain && plain.imgState === 'ready' && plain.imgPx > 0,
  `снимката се вижда и когато картата е строена преди да влезе в страницата (${plain && plain.imgState}, ${plain && plain.imgPx}px)`, plain);
ok(!!withAtt && withAtt.imgState === 'ready' && withAtt.imgPx > 0,
  `с прикачени файлове снимката също се вижда (${withAtt && withAtt.imgState}, ${withAtt && withAtt.imgPx}px)`, withAtt);
ok(!!withAtt && withAtt.imgInside,
  `снимката остава в границите на картата, а не е избутана от прикачените (imgInside ${withAtt && withAtt.imgInside})`, withAtt);
ok(!!withAtt && !withAtt.hasAttBlock,
  `картата няма блок с прикачени файлове (${withAtt && withAtt.hasAttBlock})`, withAtt);
ok(!!withAtt && withAtt.links.length === 0 && withAtt.attLinks.length === 0,
  `на картата няма нито един линк към прикачен файл (${withAtt && JSON.stringify(withAtt.links.concat(withAtt.attLinks))})`, withAtt);
ok(!!withAtt && withAtt.footerIcons === 2,
  `прикачените се виждат само като икони по тип във футъра (${withAtt && withAtt.footerIcons})`, withAtt);
if (SHOTS) {
  // Чиста снимка само на картите: бордът и входът зад тях не носят нищо за тази проверка.
  const hostEl = await page.$('#ovf-host');
  await page.evaluate(() => {
    document.querySelectorAll('body > *').forEach(el => {
      if (el.id !== 'ovf-host') el.style.visibility = 'hidden';
    });
    const h = document.getElementById('ovf-host');
    h.style.background = '#f2efe6';
    h.style.height = 'auto';
    h.style.width = '420px';
    h.style.padding = '12px';
  });
  await new Promise(r => setTimeout(r, 200));
  await hostEl.screenshot({ path: SHOTS + '-board-overflow.png' });
  await page.screenshot({ path: SHOTS + '-board-overflow-full.png' });
}
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
