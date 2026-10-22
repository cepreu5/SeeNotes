// Втори ред в подсказката (title) на плочката с прикачен файл: дата, час и размер.
// Собственикът (22.10): при задържане върху плочката да се вижда и от кога е файлът, и колко е
// голям - "<дата, час> · <размер>" на втори ред, с езика на приложението. Първият ред остава
// същият, aria-label не се пипа, а type=5 (място) си остава един ред, защото не е файл.
// Проверява се на истинската страница по трите пътя на четене: Drive (по id), локална папка (по
// подпапка на типа) и архив (плоско по име), плюс файл, за който метаданните не се върнаха.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/attachment-tooltip-meta.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Входът на cx-notes е index.html (то зарежда main.js) - както в settings-modal-width.mjs.
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

// Какво отговаря Drive на ?fields=size,modifiedTime. Размерите са нарочно такива, че да се види
// точното закръгляне: 2516582 B = 2.4 MB (един знак), 524288 B = 512 KB (без ",0"), 900 B - байтове.
const DRIVE_META = {
  WALLET_NEW: { size: '2516582', modifiedTime: '2026-10-22T11:32:00Z' },
  PDFDOC: { modifiedTime: '2026-10-19T08:05:00Z' },              // документ на Google: size липсва
  NOGD_ID: { size: '524288', modifiedTime: '2026-10-21T06:15:00Z' },
  AUD: { size: '900', modifiedTime: '2026-10-18T21:05:00Z' },
  // BADMETA нарочно липсва: заявката за него връща 404.
};

// Часовите пояси: и страницата, и очакваните низове смятат в UTC, за да не зависи проверката от
// машината, на която се пуска.
const TZ = 'UTC';
const FMT_OPTS = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ };
const fmt = (lang, ms) => new Intl.DateTimeFormat(lang, FMT_OPTS).format(new Date(ms));

// Файловете на "диска": размерът и датата са фиксирани, за да се сравнява с точно изчислен низ.
const LOCAL_FILES = {
  'Wallet.jpg': { size: 2516582, lastModified: 1792654200000 },  // 22.10.2026 07:30 UTC
  'photo-2.jpg': { size: 524288, lastModified: 1792525500000 },  // 20.10.2026 19:45 UTC
  'note.txt': { size: 1048576, lastModified: 1790769600000 },    // 30.09.2026 12:00 UTC
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: TZ, serviceWorkers: 'block' });

// --- Drive се замества В СТРАНИЦАТА (gapi), както в проверката на плочките ---
await ctx.addInitScript(() => {
  const F_DATA = 'FOLDER_MULTINOTES_DATA', F_IMAGES = 'FOLDER_IMAGES';
  const BY_NAME = {
    'Wallet.jpg': [{ id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-22T11:32:00Z' }],
    // Снимка без id в записа: файлът се намира по име - и метаданните трябва да тръгнат по него.
    'NoGD.jpg': [{ id: 'NOGD_ID', name: 'NoGD.jpg', modifiedTime: '2026-10-21T06:15:00Z' }],
  };
  window.__drive = { list: [], gets: [] };
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list(params) {
            const q = (params || {}).q || '';
            window.__drive.list.push(q);
            if (/\bin parents\b/i.test(q)) {
              if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
                const fname = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
                return Promise.resolve({ result: { files: fname === 'Images' ? [{ id: F_IMAGES, name: 'Images' }] : [] } });
              }
              const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
              return Promise.resolve({ result: { files: BY_NAME[name] || [] } });
            }
            if (/name\s*=\s*'multinotes_data'/.test(q)) return Promise.resolve({ result: { files: [{ id: F_DATA, name: 'multinotes_data' }] } });
            return Promise.resolve({ result: { files: [] } });
          },
          get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

// Брояч на заявките за метаданни, в самата страница: по него се вижда и кешът - повторно отваряне
// на модала не бива да пита Drive втори път за същия файл.
await ctx.addInitScript(() => {
  window.__meta = { started: 0, pending: 0, settled: 0, urls: [] };
  const realFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : ((args[0] && args[0].url) || '');
    const isMeta = /fields=size(%2C|,)modifiedTime/i.test(url);
    if (isMeta) { window.__meta.started++; window.__meta.pending++; window.__meta.urls.push(url); }
    const p = realFetch(...args);
    if (isMeta) {
      const done = () => { window.__meta.pending--; window.__meta.settled++; };
      p.then(done, done);
    }
    return p;
  };
});

// Кои id-та са питани за метаданни - за да се види, че снимка без id минава по името, а архивът и
// локалната папка не питат Drive изобщо.
const metaHits = [];
let googleHits = 0;
// Същата таблица, която заместителят на gapi дава в страницата: в cx-notes заявките за списъци в
// Drive минават през fetch, значи маршрутът тук трябва да ги отговаря.
const BY_NAME = {
  'Wallet.jpg': [{ id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-22T11:32:00Z' }],
  // Снимка без id в записа: файлът се намира по име - и метаданните трябва да тръгнат по него.
  'NoGD.jpg': [{ id: 'NOGD_ID', name: 'NoGD.jpg', modifiedTime: '2026-10-21T06:15:00Z' }],
};
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const url = route.request().url();
  googleHits++;
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=size(%2C|,)modifiedTime/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    metaHits.push(fileId);
    const data = DRIVE_META[fileId];
    if (!data) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  }
  const thumb = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (thumb) {
    const fileId = decodeURIComponent(thumb[1]);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s220` }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  // Самото съдържание на файловете не се дава: отварянето на type=3 минава по резервния линк, а
  // проверката тук е за подсказката, не за прегледа.
  if (/\/drive\/v3\/files\/[^?]+\?alt=media/.test(url)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  // Списъците в Drive (папка по име, файл по име): main ги чете през gapi клиента, а cx-notes - с
  // fetch и токен от storage, затова тук се отговаря на същите заявки със същите данни.
  if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
    const q = new URL(url).searchParams.get('q') || '';
    if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
      const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
      const id = name === 'Images' ? 'FOLDER_IMAGES' : 'FOLDER_' + name; // папката с данните + подпапките по тип
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: id ? [{ id, name }] : [] }) });
    }
    const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: BY_NAME[name] || [] }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

// В cx-notes Drive се чете с fetch и токен от storage (gapi.client.drive не се вика никъде),
// затова токенът се слага още преди зареждането - както прави type8-inline-image.mjs.
await page.addInitScript(() => {
  sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
});

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof showModal === 'function'
  && typeof buildAttachmentTile === 'function' && typeof fillAttachmentTileMeta === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което рендерът очаква (без логин и без startApp) ---
// Фалшиви handle-и: същински File обекти в страницата, с фиксирани дата и размер - до диска не се
// стига, а очакваният низ се смята от същите числа.
await page.evaluate((files) => {
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return null; };
  const notFound = (m) => { const e = new Error(m); e.name = 'NotFoundError'; return e; };
  const makeFile = (name) => {
    const spec = files[name] || { size: 1024, lastModified: 1792654200000 };
    // Съдържанието не е истинска картинка/звук - тук се гледат само lastModified и size.
    return new File([new Uint8Array(spec.size)], name, {
      lastModified: spec.lastModified,
      type: 'application/octet-stream'
    });
  };
  const fileHandleFor = (name) => ({ kind: 'file', name, getFile: async () => makeFile(name) });
  window.__fsCalls = [];
  // Локалната папка има подпапки по тип; архивът е плоският корен.
  const LOCAL_DIRS = { Images: ['Wallet.jpg'], Sound: ['photo-2.jpg'], Other: [], Video: [] };
  window.__localHandle = {
    kind: 'directory', name: 'fake-local',
    async getDirectoryHandle(name) {
      window.__fsCalls.push({ fs: 'local', op: 'getDirectoryHandle', name });
      if (!(name in LOCAL_DIRS)) throw notFound('local: no ' + name);
      return {
        kind: 'directory',
        async getFileHandle(fname) {
          window.__fsCalls.push({ fs: 'local/' + name, op: 'getFileHandle', name: fname });
          if (!LOCAL_DIRS[name].includes(fname)) throw notFound(name + ': no ' + fname);
          return fileHandleFor(fname);
        },
      };
    },
    async getFileHandle(name) { window.__fsCalls.push({ fs: 'local', op: 'getFileHandle', name }); throw notFound('local: files are in the folders'); },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
  window.__archiveHandle = {
    kind: 'directory', name: 'fake-archive',
    async getFileHandle(name) {
      window.__fsCalls.push({ fs: 'archive', op: 'getFileHandle', name });
      if (!(name in files)) throw notFound('archive: no ' + name);
      return fileHandleFor(name);
    },
    async getDirectoryHandle(name) { window.__fsCalls.push({ fs: 'archive', op: 'getDirectoryHandle', name }); throw notFound('flat archive'); },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
}, LOCAL_FILES);

// --- Прикачените файлове по бележки: различни id-та, за да не се смесват режимите ---
const ATT_DRIVE = [
  { noteid: 'G1', path: 'Wallet.jpg', pathGD: 'WALLET_NEW', type: 1 },              // размер + дата
  { noteid: 'G1', path: 'Винетка 2026-27.pdf', pathGD: 'PDFDOC', type: 3 },         // size липсва
  { noteid: 'G1', path: 'Счупен архив.zip', pathGD: 'BADMETA', type: 3 },           // 404
  { noteid: 'G1', path: 'NoGD.jpg', pathGD: '', type: 1 },                          // id по име
  { noteid: 'G1', path: '5. MONEY.mp3', pathGD: 'AUD', type: 2, description: 'voice' }, // байтове
  { noteid: 'G1', path: '42.7|23.3|Моят етикет', type: 5 },                         // място: не е файл
];
const ATT_LOCAL = [
  { noteid: 'L1', path: 'Wallet.jpg', type: 1 },    // Images/, 2516582 B
  { noteid: 'L1', path: 'photo-2.jpg', type: 2 },   // Sound/, 524288 B
];
const ATT_ARCHIVE = [
  { noteid: '501', path: 'note.txt', type: 3 },     // плоско, 1048576 B
];
await page.evaluate((all) => { mediaData.push(...all); }, [...ATT_DRIVE, ...ATT_LOCAL, ...ATT_ARCHIVE]);

const setMode = (mode) => page.evaluate((mode) => {
  useArhDb = mode === 'archive';
  useLocalFolder = mode === 'local';
  useGoogleDb = mode === 'drive';
  useIndexedDb = false;
  dbSourceGlobal = mode === 'archive' ? 3 : (mode === 'local' ? 2 : null);
  dirHandle = null;
  isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
}, mode);

const useDir = (which) => page.evaluate((which) => {
  dirHandle = which === 'archive' ? window.__archiveHandle : (which === 'local' ? window.__localHandle : null);
  window.__fsCalls.length = 0;
}, which);

const setLang = (lang) => page.evaluate((lang) => {
  currentLang = lang;
  localStorage.setItem('language', lang);
}, lang);

// Модалът се отваря през истинския showModal и се чакат всички плочки да са на място.
// В cx-notes showModal със СЪЩИЯ текст само вдига съществуващия прозорец отпред, без да го строи
// наново, затова текстът се сменя при всяко отваряне и бележката се строи от нулата.
let openCount = 0;
const openModal = (opts, expected) => page.evaluate(async ({ opts, expected, raw }) => {
  showModal({ raw, format: null, ...opts });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = document.querySelectorAll('#modal-body .nm-attach-tile').length;
    if (count && count === expected) return count;
    await new Promise(r => setTimeout(r, 30));
  }
  return document.querySelectorAll('#modal-body .nm-attach-tile').length;
}, { opts, expected, raw: `тестова бележка №${++openCount}` });

// Чака се броячът в страницата, не фиксирано време: щом заявките за метаданни са приключили и
// кадрите са утихнали, вторите редове са дописани (или окончателно ги няма).
const settle = () => page.evaluate(async () => {
  const deadline = performance.now() + 8000;
  let quiet = 0;
  while (performance.now() < deadline) {
    await new Promise(r => requestAnimationFrame(r));
    if (window.__meta.pending === 0) quiet++; else quiet = 0;
    if (quiet >= 6) break;
  }
  return { started: window.__meta.started, settled: window.__meta.settled, pending: window.__meta.pending };
});

const readTiles = () => page.evaluate(() => [...document.querySelectorAll('#modal-body .nm-attach-tile')].map(t => {
  const title = t.getAttribute('title');
  return {
    title,
    lines: title === null ? [] : title.split('\n'),
    aria: t.getAttribute('aria-label'),
    type: t.dataset.type,
  };
}));

// ======================= 1. Drive, английски: два реда, точно изчислени =======================
await setLang('en');
await setMode('drive');
const count1 = await openModal({ gdid: 'G1' }, ATT_DRIVE.length);
const s1 = await settle();
const t1 = await readTiles();
ok(count1 === ATT_DRIVE.length, `Drive: всичките ${ATT_DRIVE.length} плочки са на място (${count1})`);
ok(s1.pending === 0 && s1.started >= 5, `Drive: заявките за метаданни са приключили (${JSON.stringify(s1)})`);

const expWallet = `${fmt('en', Date.parse(DRIVE_META.WALLET_NEW.modifiedTime))} · 2.4 MB`;
ok(expWallet === '10/22/2026, 11:32 AM · 2.4 MB', `очакваният низ за Wallet.jpg е точно този (${expWallet})`);
ok(t1[0] && t1[0].title === `Wallet.jpg\n${expWallet}`,
  `Drive: подсказката на Wallet.jpg е два реда - име, после дата, час и размер (${JSON.stringify(t1[0] && t1[0].title)})`, t1[0]);
ok(t1[0] && t1[0].lines.length === 2 && t1[0].lines[0] === 'Wallet.jpg',
  `Drive: първият ред не е пипнат (${JSON.stringify(t1[0] && t1[0].lines)})`, t1[0]);

const expPdf = fmt('en', Date.parse(DRIVE_META.PDFDOC.modifiedTime));
ok(t1[1] && t1[1].title === `Винетка 2026-27.pdf\n${expPdf}`,
  `Drive: без размер (документ на Google) вторият ред носи само датата и часа (${JSON.stringify(t1[1] && t1[1].title)})`, t1[1]);
ok(t1[1] && t1[1].lines.length === 2 && !t1[1].lines[1].includes('·'),
  `Drive: когато размер няма, няма и разделителя "·" (${JSON.stringify(t1[1] && t1[1].lines[1])})`, t1[1]);

ok(metaHits.includes('NOGD_ID'), `Drive: снимка без id в записа пита по намерения по име файл (${JSON.stringify(metaHits)})`);
const expNoGd = `${fmt('en', Date.parse(DRIVE_META.NOGD_ID.modifiedTime))} · 512 KB`;
ok(t1[3] && t1[3].title === `NoGD.jpg\n${expNoGd}`,
  `Drive: файл, намерен по име, също получава втори ред (${JSON.stringify(t1[3] && t1[3].title)})`, t1[3]);

const expAud = `${fmt('en', Date.parse(DRIVE_META.AUD.modifiedTime))} · 900 B`;
ok(t1[4] && t1[4].title === `5. MONEY.mp3 — voice\n${expAud}`,
  `Drive: първият ред пази описанието, вторият носи дата и байтове под 1 KB (${JSON.stringify(t1[4] && t1[4].title)})`, t1[4]);

// ======================= 2. Място (type=5) няма втори ред =======================
ok(t1[5] && t1[5].title === 'Моят етикет' && t1[5].lines.length === 1,
  `място (type=5): подсказката е един ред, както преди (${JSON.stringify(t1[5] && t1[5].title)})`, t1[5]);

// ======================= 3. aria-label не се пипа =======================
ok(t1.every(t => t.aria === null || !t.aria.includes('\n')), `aria-label не съдържа нов ред (${JSON.stringify(t1.map(t => t.aria))})`);
ok(t1[0] && t1[0].aria === 'Wallet.jpg' && t1[4] && t1[4].aria === '5. MONEY.mp3 — voice',
  `aria-label остава точно името, както преди (${JSON.stringify(t1.map(t => t.aria))})`);

// ======================= 4. Без метаданни (404) плочката пак отваря файла =======================
ok(t1[2] && t1[2].title === 'Счупен архив.zip' && t1[2].lines.length === 1,
  `метаданните върнаха 404: подсказката си остава един ред (${JSON.stringify(t1[2] && t1[2].title)})`, t1[2]);
const clickBroken = await page.evaluate(async () => {
  const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile')][2];
  if (!tile) return { missing: true };
  window.__opened.length = 0;
  tile.click();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !window.__opened.length) await new Promise(r => setTimeout(r, 30));
  return { opened: window.__opened.slice() };
});
ok(clickBroken.opened && clickBroken.opened.length === 1 && String(clickBroken.opened[0]).includes('BADMETA'),
  `метаданните върнаха 404: кликът на плочката пак отваря файла (${JSON.stringify(clickBroken)})`, clickBroken);

// ======================= 5. Български: същите данни, българска подредба =======================
await setLang('bg');
await openModal({ gdid: 'G1' }, ATT_DRIVE.length);
await settle();
const t2 = await readTiles();
const expWalletBg = `${fmt('bg', Date.parse(DRIVE_META.WALLET_NEW.modifiedTime))} · 2,4 MB`;
ok(t2[0] && t2[0].title === `Wallet.jpg\n${expWalletBg}`,
  `на български: същите данни, с българска подредба и десетична запетая (${JSON.stringify(t2[0] && t2[0].title)})`, t2[0]);

// Кешът: успешните метаданни се помнят за сесията, повторното отваряне не пита Drive пак.
// Провалените (404) нарочно НЕ се помнят - същото правило като при миниатюрите.
const walletHits = metaHits.filter(id => id === 'WALLET_NEW').length;
ok(walletHits === 1, `кеш: повторното отваряне не пита Drive втори път за същия файл (${walletHits} заявки за WALLET_NEW)`);

// ======================= 6. Локална папка: дата и размер от самия файл =======================
await setMode('local');
await useDir('local');
const googleBefore = googleHits;
await openModal({ gdid: 'L1' }, ATT_LOCAL.length);
await settle();
const t3 = await readTiles();
const expLocal = `${fmt('bg', LOCAL_FILES['Wallet.jpg'].lastModified)} · 2,4 MB`;
ok(t3[0] && t3[0].title === `Wallet.jpg\n${expLocal}`,
  `локална папка: датата е lastModified на файла, размерът - размерът му (${JSON.stringify(t3[0] && t3[0].title)})`, t3[0]);
const expSound = `${fmt('bg', LOCAL_FILES['photo-2.jpg'].lastModified)} · 512 KB`;
ok(t3[1] && t3[1].title === `photo-2.jpg\n${expSound}`,
  `локална папка: звукът се търси в Sound/, а 512 KB е без излишното ",0" (${JSON.stringify(t3[1] && t3[1].title)})`, t3[1]);
const soundCalls = await page.evaluate(() => window.__fsCalls.slice());
ok(soundCalls.some(c => c.fs === 'local/Sound' && c.op === 'getFileHandle' && c.name === 'photo-2.jpg'),
  `локална папка: файлът е потърсен в подпапката на типа (${JSON.stringify(soundCalls.slice(0, 4))})`, soundCalls);

// ======================= 7. Архив: плоско по име, 1 MB без ",0" =======================
await setMode('archive');
await useDir('archive');
await openModal({ id: '501' }, ATT_ARCHIVE.length);
await settle();
const t4 = await readTiles();
const expNote = `${fmt('bg', LOCAL_FILES['note.txt'].lastModified)} · 1 MB`;
ok(t4[0] && t4[0].title === `note.txt\n${expNote}`,
  `архив: плоско по име, размер 1 MB без излишното ",0" (${JSON.stringify(t4[0] && t4[0].title)})`, t4[0]);
ok(t4[0] && t4[0].aria === 'note.txt', `архив: aria-label остава само името (${JSON.stringify(t4[0] && t4[0].aria)})`, t4[0]);

// ======================= 8. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('плочки: ' + JSON.stringify(await readTiles(), null, 1));
  console.log('питани id-та: ' + JSON.stringify(metaHits));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
