// Вградени картинки (text_span type=8) на main, когато приложението НЕ работи с Google Drive:
// бележките са заредени от АРХИВ (useArhDb) или от ЛОКАЛНА ПАПКА (useLocalFolder), т.е. файловете
// са на диска и няма нито токен, нито папка Images в Drive. Досега този път питаше само Drive и
// рамката оставаше вечно в is-loading (собственикът виждаше само името на файла в празен placeholder),
// докато прикачените файлове в същата бележка се отваряха - защото loadMedia има и локален клон.
// Проверката кара истинската страница да мине по трите режима и мери какво пита файловата система.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/type8-inline-image-offline.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // main-овото приложение е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel.endsWith('mainn.js') ? rel.slice(0, -'mainn.js'.length) + 'main.js' : rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// Истински PNG (8x6), за да има картинката реален naturalWidth - иначе "заредена" не значи нищо.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAYElEQVR4nAXBIQEAIAxFQeIQghALQYgXAj399fTX04vF3drMYYK5DMxjxJhZmz500JeGfrRo02vjgwNfDH5Y2Hht6lBBXQrqUaJMrY0OCnQR6CEho7XJQwZ5SchHijT5AYKoS/Evr2bEAAAAAElFTkSuQmCC';

// Точното изречение (същото като в Drive проверката), за да е сигурно, че формата на записа е реалната.
const TXT = 'Може да добавите всяка бележка на * началния екран * като widget';
const STAR1 = TXT.indexOf('*');
const span8 = (start, paramstring, paramint) => ({ start, end: start + 1, type: 8, paramstring, paramint });
const ANDROID = '/storage/emulated/0/Download/Images/';

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// gapi се замества В СТРАНИЦАТА (както в Drive проверката) и записва ВСЯКО питанe към Drive -
// така се вижда дали локалният/архивният път случайно не пита Drive.
await ctx.addInitScript(() => {
  const F_DATA = 'FOLDER_MULTINOTES_DATA', F_IMAGES = 'FOLDER_IMAGES';
  const BY_NAME = {
    'Wallet.jpg': [{ id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-20T09:00:00Z' }],
    // Файл, който СЪЩЕСТВУВА само на диска: ако локалният път пита Drive, тук ще го намери и
    // проверката ще хване грешния източник.
    'arch_photo.png': [{ id: 'DRIVE_ARCH_PHOTO', name: 'arch_photo.png', modifiedTime: '2026-10-20T09:00:00Z' }],
  };
  window.__drive = { list: [], gets: [], files: BY_NAME };
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'tok' }; },
      drive: {
        files: {
          list(params) {
            const p = params || {};
            window.__drive.list.push({ q: p.q || '', orderBy: p.orderBy || null, pageSize: p.pageSize || null });
            const q = p.q || '';
            if (/\bin parents\b/i.test(q)) {
              if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
                const fname = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
                return Promise.resolve({ result: { files: fname === 'Images' ? [{ id: F_IMAGES, name: 'Images' }] : [] } });
              }
              const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
              return Promise.resolve({ result: { files: BY_NAME[name] || [] } });
            }
            if (/name\s*=\s*'multinotes_data'/.test(q)) {
              return Promise.resolve({ result: { files: [{ id: F_DATA, name: 'multinotes_data' }] } });
            }
            return Promise.resolve({ result: { files: [] } });
          },
          get(params) {
            window.__drive.gets.push((params || {}).fileId || null);
            return Promise.resolve({ result: { thumbnailLink: `https://thumb.invalid/${(params || {}).fileId}=s220` } });
          },
        },
      },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

// Всяко излизане навън се брои: дисковите заявки минават през fetch към www.googleapis.com, а
// локалният/архивният път не бива да прави нито една такава.
let googleHits = 0;
const googleUrls = [];
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  if (/^https:\/\/www\.googleapis\.com\//.test(url)) { googleHits++; googleUrls.push(url.slice(0, 120)); }
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${decodeURIComponent(meta[1])}=s220` }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c6d2e4"/></svg>';
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
// Помощните скриптове на main не участват в проверката и без логин само биха добавили чужди грешки.
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof formatText === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което рендерът на main очаква (без логин и без startApp) ---
await page.evaluate(() => {
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  localStorage.setItem('lang', currentLang || 'bg');
});

// --- Фалшиви handle-и на файловата система: същински File обекти, без да пипаме диска ---
// Архивът е ПЛОСЪК (getFileHandle по име, никакви подпапки), локалната папка има Images/ подпапка.
// Всеки отказ е истинският DOMException-подобен случай: NotFoundError.
await page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const makeFile = (name) => new File([bytes], name, { type: 'image/png' });
  window.__pngBytes = bytes.length;
  window.__fsCalls = [];
  const notFound = (msg) => { const e = new Error(msg); e.name = 'NotFoundError'; return e; };
  const fileHandle = (name) => ({ kind: 'file', name, async getFile() { return makeFile(name); } });

  window.__ARCHIVE_FILES = ['arch_photo.png', 'click_photo.png', 'cache_once.png'];
  window.__LOCAL_FILES = ['local_photo.png'];

  window.__archiveHandle = {
    kind: 'directory',
    async getFileHandle(name) {
      window.__fsCalls.push({ fs: 'archive', op: 'getFileHandle', name });
      if (!window.__ARCHIVE_FILES.includes(name)) throw notFound('archive: няма ' + name);
      return fileHandle(name);
    },
    async getDirectoryHandle(name) {
      // Ако кодът потърси Images/ в архив, това е грешката, която проверката трябва да хване.
      window.__fsCalls.push({ fs: 'archive', op: 'getDirectoryHandle', name });
      throw notFound('архивът е плосък: няма папка ' + name);
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };

  window.__localHandle = {
    kind: 'directory',
    async getFileHandle(name) {
      window.__fsCalls.push({ fs: 'local', op: 'getFileHandle', name });
      throw notFound('локално: файловете са в Images/, не в корена');
    },
    async getDirectoryHandle(name) {
      window.__fsCalls.push({ fs: 'local', op: 'getDirectoryHandle', name });
      if (name !== 'Images') throw notFound('локално: няма папка ' + name);
      return {
        kind: 'directory',
        async getFileHandle(fname) {
          window.__fsCalls.push({ fs: 'local/Images', op: 'getFileHandle', name: fname });
          if (!window.__LOCAL_FILES.includes(fname)) throw notFound('Images: няма ' + fname);
          return fileHandle(fname);
        },
      };
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
}, PNG_B64);

// --- Режимът: точно глобалните флагове, които приложението ползва и за прикачените файлове ---
const setMode = (mode) => page.evaluate((mode) => {
  useArhDb = mode === 'archive';
  useLocalFolder = mode === 'local';
  useGoogleDb = mode === 'drive';
  useIndexedDb = false;
  dbSourceGlobal = mode === 'archive' ? 3 : (mode === 'local' ? 2 : null);
  dirHandle = null; // фалшивият handle се слага след това, ако сценарият има такъв
  isOfflineMode = mode === 'archive'; // архив = офлайн; тук това не бива да е пречка
  authToken = null;
}, mode);

const useDir = (which) => page.evaluate((which) => {
  dirHandle = which === 'archive' ? window.__archiveHandle : (which === 'local' ? window.__localHandle : null);
  window.__fsCalls.length = 0;
}, which);

const fsCalls = () => page.evaluate(() => window.__fsCalls.slice());

// --- Картите се строят през истинския createNoteElement, в собствен видим контейнер ---
const buildCards = (cards, hostWidth) => page.evaluate(async ({ cards, hostWidth }) => {
  let host = document.getElementById('inline-img-probe-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'inline-img-probe-host';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  host.style.cssText = `position:fixed;left:0;top:0;width:${hostWidth || 600}px;height:900px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;z-index:99999;background:#fff;`;
  for (const c of cards) {
    const id = 910000 + Math.floor(Math.random() * 80000);
    const nt = {
      alarm_type: -1, boardid: 'probe-board', calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'probe' + id, id, notetxt: c.txt, numord: id, sellist: 0, status: 0,
      text_span: c.span || '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.dataset.probe = c.key;
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    host.appendChild(el);
  }
  return true;
}, { cards, hostWidth });

const waitSettled = () => page.waitForFunction(() => {
  const boxes = [...document.querySelectorAll('#inline-img-probe-host .nm-inline-img')];
  return boxes.length > 0 && boxes.every(b => b.dataset.nmState !== 'loading');
}, null, { timeout: 15000 }).then(() => 'settled').catch(() => 'timeout');

const readCards = () => page.evaluate(() => {
  const out = {};
  for (const card of document.querySelectorAll('#inline-img-probe-host .note')) {
    const content = card.querySelector('.note-content');
    const frames = [...(content ? content.querySelectorAll('.nm-inline-img') : [])];
    out[card.dataset.probe] = {
      text: content ? content.textContent : '',
      normalized: content ? content.textContent.replace(/\s+/g, ' ').trim() : '',
      frames: frames.map(f => {
        const img = f.querySelector('img');
        const r = f.getBoundingClientRect();
        return {
          file: f.dataset.nmFile,
          state: f.dataset.nmState,
          isLoading: f.classList.contains('is-loading'),
          isReady: f.classList.contains('is-ready'),
          isMissing: f.classList.contains('is-missing'),
          isUnavailable: f.classList.contains('is-unavailable'),
          imgSrc: img ? img.getAttribute('src') : null,
          naturalWidth: img ? img.naturalWidth : null,
          imgWidth: img ? Math.round(img.getBoundingClientRect().width) : 0,
          frameWidth: Math.round(r.width),
          frameHeight: Math.round(r.height),
          label: f.textContent,
        };
      }),
    };
  }
  return out;
});

// =====================================================================================
// 1. АРХИВ: файлът се чете от плоския архив по име, картинката застава на мястото си
// =====================================================================================
await setMode('archive');
await useDir('archive');
const googleBefore = googleHits;
await buildCards([{ key: 'arch', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'arch_photo.png', 4)) }], 600);
const settledArch = await waitSettled();
const rArch = await readCards();
const a0 = (rArch.arch && rArch.arch.frames[0]) || {};
ok(settledArch === 'settled', `архив: рамката излиза от "loading" (${settledArch})`);
ok(a0.state === 'ready' && a0.isReady && !a0.isLoading,
  `архив: състоянието е ready, не вечно is-loading (${a0.state}, loading=${a0.isLoading})`, a0);
ok(/^blob:/.test(String(a0.imgSrc)), `архив: картинката идва от файла на диска (blob URL), не от Drive (${a0.imgSrc})`);
ok(a0.naturalWidth > 0 && a0.imgWidth > 0,
  `архив: истинска картинка - naturalWidth ${a0.naturalWidth}, начертана ширина ${a0.imgWidth}px`, a0);
ok(a0.frameHeight > 0, `архив: рамката има реална височина, не е празна (${a0.frameHeight}px)`);
ok(!String(a0.label).includes('arch_photo.png') && String(a0.label).trim() === '',
  `архив: името на файла НЕ стои в рамката - там е самата снимка (${JSON.stringify(a0.label)})`);
// В бележката е маркирана само ПЪРВАТА звездичка (вторият type=8 запис липсва), затова вторият
// маркер остава като обикновен текст - точно както преди поправката.
const EXPECT_PLAIN = (TXT.slice(0, STAR1) + TXT.slice(STAR1 + 1)).replace(/\s+/g, ' ').trim();
ok(String(rArch.arch.normalized) === EXPECT_PLAIN,
  'архив: текстът е на мястото си - маркерът е заменен от снимката, останалото е непокътнато', rArch.arch.text);

const archCalls = await fsCalls();
ok(archCalls.some(c => c.op === 'getFileHandle' && c.name === 'arch_photo.png'),
  'архив: файлът е поискан по плоското си име (getFileHandle("arch_photo.png"))', archCalls);
ok(!archCalls.some(c => c.op === 'getDirectoryHandle'),
  'архив: НЕ се отваря подпапка Images - архивът е плосък', archCalls);
ok(!archCalls.some(c => String(c.name).includes('/')),
  'архив: нито едно име не носи път/подпапка', archCalls);

// =====================================================================================
// 2. Drive не е питан нито веднъж в архив режим (gapi и fetch)
// =====================================================================================
const driveCalls = await page.evaluate(() => window.__drive.list.length);
ok(driveCalls === 0, `архив: нула заявки към Drive през gapi (${driveCalls})`,
  await page.evaluate(() => window.__drive.list.slice(0, 3)));
ok(googleHits === googleBefore, `архив: нула заявки към googleapis.com след рендера (${googleHits - googleBefore})`, googleUrls.slice(0, 3));

// =====================================================================================
// 3. ЛОКАЛНА ПАПКА: файлът се търси в Images/, както при прикачените
// =====================================================================================
await setMode('local');
await useDir('local');
await buildCards([{ key: 'loc', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'local_photo.png', 5)) }], 600);
const settledLocal = await waitSettled();
const rLocal = await readCards();
const l0 = (rLocal.loc && rLocal.loc.frames[0]) || {};
ok(settledLocal === 'settled' && l0.state === 'ready',
  `локално: картинката се зарежда от локалната папка (${settledLocal}, ${l0.state})`, l0);
ok(/^blob:/.test(String(l0.imgSrc)) && l0.naturalWidth > 0 && l0.imgWidth > 0,
  `локално: истинска картинка от файла на диска (${l0.imgSrc}, naturalWidth ${l0.naturalWidth}, ${l0.imgWidth}px)`, l0);
const localCalls = await fsCalls();
ok(localCalls.some(c => c.op === 'getDirectoryHandle' && c.name === 'Images'),
  'локално: отваря се подпапката Images (там са снимките на локалната папка)', localCalls);
ok(localCalls.some(c => c.fs === 'local/Images' && c.op === 'getFileHandle' && c.name === 'local_photo.png'),
  'локално: файлът е поискан В Images, а не в корена на папката', localCalls);
ok(!localCalls.some(c => c.fs === 'local' && c.op === 'getFileHandle' && c.name === 'local_photo.png'),
  'локално: коренът на папката не се пита за файла (иначе би бил архивният път)', localCalls);

// =====================================================================================
// 4. ЛИПСВАЩ ФАЙЛ В АРХИВ: рамката остава с името и причината, без счупена картинка
// =====================================================================================
await setMode('archive');
await useDir('archive');
await buildCards([{ key: 'miss', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'NoSuchArchive.png', 4)) }], 600);
const settledMiss = await waitSettled();
const rMiss = await readCards();
const m0 = (rMiss.miss && rMiss.miss.frames[0]) || {};
ok(settledMiss === 'settled' && m0.state === 'missing',
  `липсващ в архива: състоянието е missing, не вечен loading (${settledMiss}, ${m0.state})`, m0);
ok(m0.isMissing && !m0.isUnavailable && !m0.isLoading, `липсващ в архива: рамката е в is-missing (${m0.state})`, m0);
ok(!m0.imgSrc, `липсващ в архива: няма счупена картинка (${m0.imgSrc})`);
ok(String(m0.label).includes('NoSuchArchive.png'),
  `липсващ в архива: рамката казва името на файла (${JSON.stringify(m0.label)})`);

// =====================================================================================
// 5. БЕЗ HANDLE И БЕЗ НИЩО В IndexedDB: недостъпно, но без изключение в страницата
// =====================================================================================
await setMode('archive');
await page.evaluate(() => { dirHandle = null; window.__fsCalls.length = 0; });
const errsBeforeNoHandle = errs.length;
await buildCards([{ key: 'nohandle', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'nohandle_photo.png', 3)) }], 600);
const settledNo = await waitSettled();
const rNo = await readCards();
const h0 = (rNo.nohandle && rNo.nohandle.frames[0]) || {};
ok(settledNo === 'settled' && h0.state === 'unavailable',
  `без handle: състоянието е unavailable, не вечен loading (${settledNo}, ${h0.state})`, h0);
ok(h0.isUnavailable && !h0.isLoading && !h0.imgSrc,
  `без handle: рамката е в is-unavailable и без картинка (${h0.state})`, h0);
ok(String(h0.label).includes('nohandle_photo.png'),
  `без handle: рамката пак казва кой файл липсва (${JSON.stringify(h0.label)})`);
ok(errs.length === errsBeforeNoHandle,
  `без handle: страницата не хвърля грешка (${errs.slice(0, 2).join(' | ')})`);

// =====================================================================================
// 6. ЕДИН ФАЙЛ СЕ ЧЕТЕ ВЕДНЪЖ: две карти с една и същa снимка = едно getFileHandle
// =====================================================================================
await setMode('archive');
await useDir('archive');
await buildCards([
  { key: 'c1', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'cache_once.png', 4)) },
  { key: 'c2', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'cache_once.png', 4)) },
], 600);
const settledCache = await waitSettled();
const rCache = await readCards();
const cf1 = (rCache.c1 && rCache.c1.frames[0]) || {};
const cf2 = (rCache.c2 && rCache.c2.frames[0]) || {};
ok(settledCache === 'settled' && cf1.state === 'ready' && cf2.state === 'ready',
  `кеш: и двете карти показват снимката (${cf1.state}, ${cf2.state})`, [cf1.state, cf2.state]);
const cacheCalls = (await fsCalls()).filter(c => c.op === 'getFileHandle' && c.name === 'cache_once.png');
ok(cacheCalls.length === 1, `кеш: файлът се чете един път за двете карти (${cacheCalls.length})`, cacheCalls);
ok(/^blob:/.test(String(cf1.imgSrc)) && cf1.imgSrc === cf2.imgSrc,
  `кеш: двете рамки ползват един и същ blob URL (${cf1.imgSrc} | ${cf2.imgSrc})`);

// =====================================================================================
// 7. КЛИК В АРХИВ РЕЖИМ: отваря се съществуващият преглед (showInNotePreview)
// =====================================================================================
await setMode('archive');
await useDir('archive');
await buildCards([{ key: 'click', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'click_photo.png', 6)) }], 600);
const settledClick = await waitSettled();
ok(settledClick === 'settled', `клик: рамката е готова преди клика (${settledClick})`);
const overlay = await page.evaluate(async () => {
  const card = document.querySelector('#inline-img-probe-host .note[data-probe="click"]');
  const box = card && card.querySelector('.nm-inline-img.is-ready');
  if (!box) return { missing: true };
  authToken = null; // архив режим: прегледът не бива да разчита на Drive токен
  box.click();
  const deadline = Date.now() + 8000;
  let src = null, tag = null;
  while (Date.now() < deadline) {
    const el = card.querySelector('.image-preview-overlay img, .image-preview-overlay video');
    if (el && el.getAttribute('src')) { src = el.getAttribute('src'); tag = el.tagName.toLowerCase(); break; }
    await new Promise(r => setTimeout(r, 50));
  }
  const ov = card.querySelector('.image-preview-overlay');
  const out = { has: !!ov, src, tag, text: ov ? ov.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null };
  if (ov) ov.remove();
  return out;
});
ok(!overlay.missing && overlay.has, 'клик: отваря се съществуващият overlay за преглед', overlay);
ok(!overlay.missing && /^blob:/.test(String(overlay.src)) && (overlay.tag === 'img' || overlay.tag === 'video'),
  `клик: прегледът чете същия файл от диска (${overlay.tag}, ${overlay.src})`, overlay);

// =====================================================================================
// 8. РЕГРЕСИЯ: Drive режимът не е счупен от новото разклонение
// =====================================================================================
await setMode('drive');
await page.evaluate(() => {
  dirHandle = null;
  isOfflineMode = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
});
await buildCards([{ key: 'drv', txt: TXT, span: JSON.stringify(span8(STAR1, ANDROID + 'Wallet.jpg', 4)) }], 600);
const settledDrive = await waitSettled();
const rDrive = await readCards();
const d0 = (rDrive.drv && rDrive.drv.frames[0]) || {};
ok(settledDrive === 'settled' && d0.state === 'ready',
  `Drive регресия: картинката се зарежда както преди (${settledDrive}, ${d0.state})`, d0);
ok(String(d0.imgSrc).includes('WALLET_NEW'),
  `Drive регресия: файлът е намерен по име в Drive и thumbnail-ът е негов (${d0.imgSrc})`);
ok(d0.naturalWidth > 0 || d0.imgWidth > 0, `Drive регресия: картинката е начертана (${d0.imgWidth}px)`, d0);

// =====================================================================================
// 9. НИКАКВИ ГРЕШКИ
// =====================================================================================
ok(errs.length === 0, `няма pageerror/console error за цялото пускане (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('файлови извиквания: ' + JSON.stringify(await fsCalls()));
  console.log('Drive заявки: ' + JSON.stringify(await page.evaluate(() => window.__drive.list.slice(0, 10))));
  console.log('googleapis: ' + JSON.stringify(googleUrls.slice(0, 10)));
  console.log('рамки: ' + JSON.stringify(await readCards()));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
