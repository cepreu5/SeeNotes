// Футър с миниатюри на прикачените файлове във viewer-а (#modal-body).
// Проверява това, което собственикът поиска (21.10): лента от плочки 40x40 вместо списък с имена,
// снимките се виждат самите те, лентата се плъзга настрани, клик на плочка прави това, което
// правеше клик на ИМЕТО (преглед при Drive, файл в нов раздел в локална папка), а Ctrl+клик показва
// JSON записа на прикачения файл - винаги, не само в debug. Бордът остава със стария изглед.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/modal-attachment-tiles.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Приложението е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const SHOTS = process.env.SHOTS || '';
const ok = (cond, msg, extra) => { n++; console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}-${name}.png` }); };

// --- Drive се замества В СТРАНИЦАТА: папка Images с един файл по име ---
await ctx.addInitScript(() => {
  const F_DATA = 'FOLDER_MULTINOTES_DATA', F_IMAGES = 'FOLDER_IMAGES';
  const BY_NAME = { 'Wallet.jpg': [{ id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-20T09:00:00Z' }] };
  window.__drive = { list: [] };
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

const THUMBS = [];
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    THUMBS.push(fileId);
    if (fileId !== 'WALLET_NEW') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s220` }) });
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
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof showModal === 'function'
  && typeof buildAttachmentTile === 'function', null, { timeout: 20000 });

// --- Минималното състояние, което рендерът очаква (без логин и без startApp) ---
await page.evaluate(() => {
  contentModal = document.getElementById('content-modal');
  modalBody = document.getElementById('modal-body');
  copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
  localStorage.setItem('lang', currentLang || 'bg');
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return null; };
  // Фалшиви handle-и: същински File обекти, направени в страницата - до диска не се стига.
  const makeFile = () => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 8, 8);
    return new Promise(res => c.toBlob(b => res(new File([b], 'Wallet.jpg', { type: 'image/png' })), 'image/png'));
  };
  const notFound = (m) => { const e = new Error(m); e.name = 'NotFoundError'; return e; };
  const fileHandleFor = async (name) => ({ kind: 'file', name, getFile: async () => makeFile() });
  const LOCAL_FILES = ['Wallet.jpg'];
  const ARCHIVE_FILES = ['Wallet.jpg'];
  window.__fsCalls = [];
  window.__localHandle = {
    kind: 'directory', name: 'fake-local',
    async getDirectoryHandle(name) {
      window.__fsCalls.push({ fs: 'local', op: 'getDirectoryHandle', name });
      if (name !== 'Images') throw notFound('local: no ' + name);
      return {
        kind: 'directory',
        async getFileHandle(fname) {
          window.__fsCalls.push({ fs: 'local/Images', op: 'getFileHandle', name: fname });
          if (!LOCAL_FILES.includes(fname)) throw notFound('Images: no ' + fname);
          return fileHandleFor(fname);
        },
      };
    },
    async getFileHandle(name) { window.__fsCalls.push({ fs: 'local', op: 'getFileHandle', name }); throw notFound('local: files are in Images/'); },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
  window.__archiveHandle = {
    kind: 'directory', name: 'fake-archive',
    async getFileHandle(name) {
      window.__fsCalls.push({ fs: 'archive', op: 'getFileHandle', name });
      if (!ARCHIVE_FILES.includes(name)) throw notFound('archive: no ' + name);
      return fileHandleFor(name);
    },
    async getDirectoryHandle(name) { window.__fsCalls.push({ fs: 'archive', op: 'getDirectoryHandle', name }); throw notFound('flat archive'); },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
});

// --- Прикачените файлове на една бележка: точно типовете от оригинала ---
const ATT = [
  { noteid: 'G1', path: 'Wallet.jpg', pathGD: 'WALLET_NEW', type: 1 },
  { noteid: 'G1', path: 'Винетка 2026-27.pdf', pathGD: 'PDFDOC', type: 3 },
  { noteid: 'G1', path: '5. MONEY.mp3', pathGD: 'AUD', type: 2, description: 'voice' },
  { noteid: 'G1', path: 'sterilizacia.mp4', pathGD: 'VID', type: 4, description: '' },
  { noteid: 'G1', path: 'NoSuchPhoto.jpg', pathGD: '', type: 1 }, // липсва в Drive: плочка с икона
  { noteid: 'G1', path: '', type: 3 },                            // няма път: плочка с пунктир
  { noteid: 'G1', path: '42.7|23.3|Моят етикет', type: 5 },       // място, не файл
];
await page.evaluate((att) => { mediaData.push(...att); }, ATT);

const setMode = (mode) => page.evaluate((mode) => {
  useArhDb = mode === 'archive';
  useLocalFolder = mode === 'local';
  useGoogleDb = mode === 'drive';
  useIndexedDb = false;
  dbSourceGlobal = mode === 'archive' ? 3 : (mode === 'local' ? 2 : null);
  dirHandle = null;
  isOfflineMode = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
}, mode);

const useDir = (which) => page.evaluate((which) => {
  dirHandle = which === 'archive' ? window.__archiveHandle : (which === 'local' ? window.__localHandle : null);
  window.__fsCalls.length = 0;
}, which);

// Модалът се отваря през истинския showModal и се чака плочките да излязат от "loading".
const openModal = (opts) => page.evaluate(async (opts) => {
  window.__wallsW = undefined;
  showModal({ raw: 'тестова бележка', format: null, ...opts });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const tiles = [...document.querySelectorAll('#modal-body .nm-attach-tile')];
    if (tiles.length && tiles.every(t => !t.classList.contains('has-photo') || t.dataset.state === 'ready')) return tiles.length;
    await new Promise(r => setTimeout(r, 40));
  }
  return document.querySelectorAll('#modal-body .nm-attach-tile').length;
}, opts);

// Модалът се отваря с преход (scale 0.7 -> 1). Геометрията се мери само след като мащабът е 1,
// иначе 40px плочка се измерва като 35px и междината изглежда по-голяма.
const waitScale = () => page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  if (!body || !body.offsetWidth) return false;
  const scale = body.getBoundingClientRect().width / body.offsetWidth;
  if (Math.abs(scale - 1) > 0.01) return false;
  const w = body.getBoundingClientRect().width;
  const prev = window.__wallsW;
  window.__wallsW = w;
  return prev !== undefined && Math.abs(prev - w) < 0.5;
}, null, { timeout: 15000 }).then(() => true).catch(() => false);

const readTiles = () => page.evaluate(() => {
  const strip = document.querySelector('#modal-body .nm-attach-strip');
  if (!strip) return { strip: false };
  const cs = getComputedStyle(strip);
  const tiles = [...strip.querySelectorAll('.nm-attach-tile')];
  return {
    strip: true,
    count: tiles.length,
    gap: cs.gap,
    scrollbarWidth: cs.scrollbarWidth,
    overflowX: cs.overflowX,
    clientWidth: strip.clientWidth,
    scrollWidth: strip.scrollWidth,
    clientHeight: strip.clientHeight,
    // innerText, не textContent: скритият ред с името не бива да се брои за показан текст.
    visibleText: document.getElementById('modal-body').innerText.replace(/\s+/g, ' ').trim(),
    tiles: tiles.map(t => {
      const r = t.getBoundingClientRect();
      const tcs = getComputedStyle(t);
      const iconEl = t.querySelector('.nm-attach-tile-icon');
      const img = t.querySelector('img');
      const src = t.parentElement.querySelector('.nm-attach-source');
      const a = t.parentElement.querySelector('.nm-attach-source a');
      return {
        title: t.getAttribute('title'),
        type: t.dataset.type,
        state: t.dataset.state,
        w: Math.round(r.width), h: Math.round(r.height),
        radius: tcs.borderRadius,
        bg: tcs.backgroundColor,
        borderStyle: tcs.borderTopStyle,
        hasIcon: !!t.querySelector('.nm-attach-tile-icon svg'),
        iconShown: iconEl ? getComputedStyle(iconEl).display !== 'none' : null,
        text: t.textContent.trim(),
        imgSrc: img ? img.getAttribute('src') : null,
        imgFit: img ? getComputedStyle(img).objectFit : null,
        left: Math.round(r.left), top: Math.round(r.top),
        sourceDisplay: src ? getComputedStyle(src).display : null,
        sourceHref: a ? a.getAttribute('href') : null,
        sourceText: a ? a.textContent : null,
      };
    }),
  };
});

// ======================= 1. Drive: лента, плочки, ред =======================
await setMode('drive');
const settledDrive = await openModal({ gdid: 'G1' });
const scaled = await waitScale();
const d = await readTiles();
ok(scaled, 'модалът е отворен в края на прехода (мащаб 1) - иначе геометрията се мери смалена');
ok(settledDrive === ATT.length, `Drive: всичките ${ATT.length} прикачени файла са плочки (${settledDrive})`);
ok(d.strip === true, 'Drive: футърът е лента (.nm-attach-strip), не списък с имена');
ok(d.tiles.every(t => t.w === 40 && t.h === 40), `Drive: плочката е 40x40 (${d.tiles.map(t => t.w + 'x' + t.h).join(',')})`);
ok(d.tiles.every(t => t.radius === '6px'), `Drive: заобляне 6px (${d.tiles.map(t => t.radius).join(',')})`);
ok(d.gap === '8px', `Drive: междина 8px (${d.gap})`);
ok(d.scrollbarWidth === 'none' && d.overflowX === 'auto', `Drive: скролбарът е скрит, лентата се плъзга (scrollbar-width=${d.scrollbarWidth}, overflow-x=${d.overflowX})`);
const gapMeasured = d.tiles.length > 1 ? d.tiles[1].left - (d.tiles[0].left + d.tiles[0].w) : null;
ok(gapMeasured === 8, `Drive: измерената междина между плочките е 8px (${gapMeasured})`);
const titles = d.tiles.map(t => t.title);
ok(titles[0] === 'Wallet.jpg' && titles[1] === 'Винетка 2026-27.pdf' && titles[2] === '5. MONEY.mp3 — voice'
  && titles[3] === 'sterilizacia.mp4' && titles[4] === 'NoSuchPhoto.jpg' && titles[5] === null && titles[6] === 'Моят етикет',
  `Drive: плочките са в реда на файловете, името е в подсказката (${JSON.stringify(titles)})`);
ok(!/Wallet\.jpg|MONEY\.mp3|Винетка/.test(d.visibleText), `Drive: под плочките НЯМА имена (${JSON.stringify(d.visibleText)})`);
ok(d.tiles.every(t => t.sourceDisplay === 'none'), `Drive: старият ред (икона + линк) е скрит, но е в страницата (${d.tiles.map(t => t.sourceDisplay).join(',')})`);

// ======================= 2. Снимката е самата снимка =======================
const wallet = d.tiles[0] || {};
ok(wallet.hasIcon === true && wallet.iconShown === false, `снимка: иконата на типа е скрита, докато има снимка (${wallet.hasIcon}/${wallet.iconShown})`);
ok(wallet.state === 'ready' && String(wallet.imgSrc).includes('WALLET_NEW'),
  `снимка: плочката показва файла от папка Images в Drive, по същия път като вградените картинки (${wallet.state}, ${wallet.imgSrc})`);
ok(wallet.imgFit === 'cover', `снимка: картинката пълни плочката (object-fit=${wallet.imgFit})`);
await shot('drive');

// ======================= 3. Останалите типове носят иконата си =======================
const pdf = d.tiles[1] || {}, audio = d.tiles[2] || {}, video = d.tiles[3] || {};
ok(pdf.text === 'PDF' && pdf.bg === 'rgb(213, 69, 59)', `PDF: червена плочка с "PDF" (${JSON.stringify(pdf.text)}, ${pdf.bg})`);
ok(audio.hasIcon === true && audio.iconShown === true && audio.type === '2', `звук: плочката носи иконата си (${audio.hasIcon}, тип ${audio.type})`);
ok(video.hasIcon === true && video.iconShown === true && video.type === '4', `видео: плочката носи иконата си (${video.hasIcon}, тип ${video.type})`);
const loc = d.tiles[6] || {};
ok(loc.type === '5' && loc.hasIcon === true && String(loc.sourceHref).includes('google.com/maps'),
  `място: плочка с икона на място, зад нея линкът към картата (${loc.type}, ${loc.sourceHref})`);

// ======================= 4. Липсващ файл =======================
const noPhoto = d.tiles[4] || {}, noPath = d.tiles[5] || {};
ok(noPhoto.state === 'missing' && !noPhoto.imgSrc && noPhoto.iconShown === true && noPhoto.borderStyle === 'dashed',
  `липсващ в Drive файл: плочка с иконата на типа и пунктир, без счупена картинка (${noPhoto.state}, ${noPhoto.imgSrc}, ${noPhoto.borderStyle})`);
ok(noPath.state === 'missing' && noPath.iconShown === true && noPath.borderStyle === 'dashed',
  `без път: плочка с иконата и пунктир (${noPath.state}, ${noPath.borderStyle})`);
// Само липсващите файлове са с пунктир: мястото (type=5) не е файл и изглежда като останалите.
const borders = d.tiles.map(t => t.borderStyle);
ok(borders.every((b, i) => (i === 4 || i === 5) ? b === 'dashed' : b !== 'dashed'),
  `пунктир има само при липсващите файлове (${JSON.stringify(borders)})`);
ok(d.tiles[6] && d.tiles[6].bg !== 'rgba(180, 83, 74, 0.08)', `място: плочката не е в цвета на липсващ файл (${d.tiles[6] && d.tiles[6].bg})`);

// ======================= 5. Клик = това, което правеше кликът на името =======================
const clickPreview = await page.evaluate(async () => {
  const tile = document.querySelector('#modal-body .nm-attach-tile');
  if (!tile) return { missing: true };
  tile.click();
  const deadline = Date.now() + 8000;
  let src = null;
  while (Date.now() < deadline) {
    const img = document.querySelector('#modal-body .image-preview-overlay img') || document.querySelector('.image-preview-overlay img');
    if (img && img.getAttribute('src')) { src = img.getAttribute('src'); break; }
    await new Promise(r => setTimeout(r, 50));
  }
  document.querySelectorAll('.image-preview-overlay').forEach(o => o.remove());
  return { has: !!src, src };
});
ok(!clickPreview.missing && clickPreview.has && String(clickPreview.src).includes('WALLET_NEW'),
  `клик: в Drive отваря прегледа на бележката, както кликът на името (${clickPreview.src})`, clickPreview);

// ======================= 6. Ctrl+клик = JSON записа, винаги =======================
const ctrlJson = await page.evaluate(async () => {
  showModal({ raw: 'тестова бележка', format: null, gdid: 'G1' });
  const deadline = Date.now() + 8000;
  let tile = null;
  while (Date.now() < deadline) {
    tile = document.querySelector('#modal-body .nm-attach-tile');
    if (tile) break;
    await new Promise(r => setTimeout(r, 40));
  }
  if (!tile) return { missing: true };
  // Събитие с ctrlKey - точно това, което идва от Ctrl+клик.
  tile.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 120));
  return { text: document.getElementById('modal-body').textContent.replace(/\s+/g, ' ').trim() };
});
ok(!ctrlJson.missing && /"pathGD"\s*:\s*"WALLET_NEW"/.test(String(ctrlJson.text)),
  `Ctrl+клик: показва JSON записа на прикачения файл, без да зависи от debug (${String(ctrlJson.text).slice(0, 120)})`, ctrlJson);

// ======================= 7. Тясна лента: плъзга се, скролбар не се вижда =======================
await page.evaluate(() => { localStorage.setItem('modalWidth', '330px'); localStorage.setItem('modalHeight', '600px'); });
await page.setViewportSize({ width: 390, height: 800 });
await openModal({ gdid: 'G1' });
await waitScale();
const narrow = await readTiles();
ok(narrow.strip && narrow.scrollWidth > narrow.clientWidth,
  `тясна лента: ${ATT.length} плочки не се събират и лентата се плъзга (${narrow.clientWidth} < ${narrow.scrollWidth})`, { c: narrow.clientWidth, s: narrow.scrollWidth });
ok(narrow.clientHeight <= 46, `тясна лента: скритият скролбар не краде височина (${narrow.clientHeight}px)`);
const scrolled = await page.evaluate(async () => {
  const strip = document.querySelector('#modal-body .nm-attach-strip');
  strip.scrollLeft = 200;
  await new Promise(r => requestAnimationFrame(r));
  return strip.scrollLeft;
});
ok(scrolled > 0, `тясна лента: плъзга се наистина (scrollLeft=${scrolled})`);
await shot('narrow');
await page.evaluate(() => { localStorage.removeItem('modalWidth'); localStorage.removeItem('modalHeight'); });
await page.setViewportSize({ width: 1280, height: 900 });

// ======================= 8. Локална папка: същият път за миниатюрата =======================
await setMode('local');
await useDir('local');
await openModal({ gdid: 'G1' });
const l = await readTiles();
const lw = l.tiles[0] || {};
ok(lw.state === 'ready' && String(lw.imgSrc).startsWith('blob:'),
  `локална папка: миниатюрата идва от файла на диска, по пътя на вградените картинки (${lw.state}, ${String(lw.imgSrc).slice(0, 24)})`, lw);
const localCalls = await page.evaluate(() => window.__fsCalls.slice());
ok(localCalls.some(c => c.fs === 'local/Images' && c.op === 'getFileHandle' && c.name === 'Wallet.jpg'),
  'локална папка: файлът е потърсен в Images/, както при прикачените', localCalls);
const localClick = await page.evaluate(async () => {
  const tile = document.querySelector('#modal-body .nm-attach-tile');
  window.__opened.length = 0;
  tile.click();
  // Чакаме събитието, не фиксирано време: отварянето минава през асинхронно четене на файла.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !window.__opened.length) await new Promise(r => setTimeout(r, 30));
  return window.__opened.slice();
});
ok(localClick.length === 1 && String(localClick[0]).startsWith('blob:'),
  `локална папка: клик на плочката отваря файла, както кликът на името (${JSON.stringify(localClick)})`, localClick);

// ======================= 9. Архив: плоско, без Images/ =======================
// В архив бележките се броят по числово id, не по gdid (така е и в приложението).
await setMode('archive');
await useDir('archive');
await page.evaluate(() => { mediaData.push({ noteid: '501', path: 'Wallet.jpg', type: 1 }); });
await openModal({ id: '501' });
const arch = await readTiles();
const aw = arch.tiles[0] || {};
ok(aw.state === 'ready' && String(aw.imgSrc).startsWith('blob:'), `архив: миниатюрата се чете от плоския архив (${aw.state})`, aw);
const archCalls = await page.evaluate(() => window.__fsCalls.slice());
ok(archCalls.some(c => c.fs === 'archive' && c.op === 'getFileHandle' && c.name === 'Wallet.jpg'),
  'архив: файлът е потърсен плоско, по име', archCalls);

// ======================= 10. Бордът не се пипа =======================
const board = await page.evaluate(async () => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false; dirHandle = null;
  localStorage.setItem('oneTapLink', 'true');
  let host = document.getElementById('tiles-probe-host');
  if (!host) { host = document.createElement('div'); host.id = 'tiles-probe-host'; document.body.appendChild(host); }
  host.innerHTML = '';
  host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:900px;display:flex;flex-direction:column;gap:8px;z-index:99999;background:#fff;';
  const id = 970001;
  const nt = {
    alarm_type: -1, boardid: 'probe-board', calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
    eventId: 0, gdid: 'G1', id, notetxt: 'бележка с прикачени файлове', numord: id, sellist: 0, status: 0,
    text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
  };
  allNotesData.push(nt);
  const el = await createNoteElement(nt);
  el.style.display = 'flex';
  host.appendChild(el);
  await new Promise(r => setTimeout(r, 300));
  return {
    tiles: el.querySelectorAll('.nm-attach-tile').length,
    links: [...el.querySelectorAll('.note-content a')].map(a => a.textContent),
    text: el.innerText.replace(/\s+/g, ' ').trim(),
  };
});
ok(board.tiles === 0, `борд: картата НЕ получава плочки (${board.tiles})`);
ok(board.links.includes('Wallet.jpg') && board.links.includes('Винетка 2026-27.pdf'),
  `борд: остава старият изглед - имената като линкове (${JSON.stringify(board.links)})`);
ok(board.text.includes('Wallet.jpg'), `борд: името се вижда на картата (${JSON.stringify(board.text)})`);

// ======================= 11. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('плочки: ' + JSON.stringify((await readTiles()).tiles, null, 1));
  console.log('fs заявки: ' + JSON.stringify(await page.evaluate(() => window.__fsCalls.slice(0, 10))));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
