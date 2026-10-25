// Снимка в текста: маркер от един знак и меню с плъзгач (план 10, cx-notes).
// Проверява това, което собственикът поиска:
//   - лентата с прикачените файлове се вижда и в режим Редактиране (под кутията за редактиране);
//   - щрак върху плочка отваря менюто, а ред „Преглед" натиска ИСТИНСКИЯ <a> на файла;
//   - редовете са различни от маркер (Преглед, Ширина, Махни) и от плочка (Преглед, Ширина, Сложи в текста);
//   - плъзгачът е 10..100 стъпка 10, показва числото и записва paramint 1..10;
//   - „Сложи в текста" слага звездичка на каретата и запис type=8 с ширина 30% (paramint 3);
//   - „Махни" маха само това място, файлът остава в лентата;
//   - маркерът е широк един знак, менюто не е по-широко от 300px;
//   - пейст и влачене на файл влизат само в лентата, без type=8.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-menu.mjs      (exit 1 при провалена проверка)
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

// --- Фалшив Drive: папка Images с два файла, които се намират по име ---
const DRIVE = { list: [], thumb: [] };
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const BY_NAME = {
  'Wallet.jpg': [{ id: 'WALLET_NEW', name: 'Wallet.jpg', modifiedTime: '2026-10-20T09:00:00Z' }],
  'file_0000.png': [{ id: 'FILE0000', name: 'file_0000.png', modifiedTime: '2026-10-19T09:00:00Z' }],
  // Файл, който НЕ е в текста на бележката: менюто от плочката трябва да го покаже още първия път.
  'nova.jpg': [{ id: 'NOVA_NEW', name: 'nova.jpg', modifiedTime: '2026-10-21T09:00:00Z' }],
};
const THUMB = { WALLET_NEW: 's220', FILE0000: 's220', NOVA_NEW: 's220' };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
  const url = route.request().url();
  const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
  if (meta) {
    const fileId = decodeURIComponent(meta[1]);
    DRIVE.thumb.push(fileId);
    if (!THUMB[fileId]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=${THUMB[fileId]}` }) });
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: BY_NAME[name] || [] }) });
  }
  if (url.startsWith('https://thumb.invalid/')) {
    // Размерът на самата снимка: Wallet.jpg е голяма (4000px), малките (file_0000.png, nova.jpg)
    // са 300px - така и 30%, и 60% се побират в колоната и се вижда точната стойност.
    const size = /FILE0000|NOVA_NEW/.test(url) ? [300, 225] : [4000, 3000];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}"><rect width="${size[0]}" height="${size[1]}" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
// Прегледът (showInNotePreview) иска минимален gapi - без него спира преди да поиска картинката.
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
  // Интерфейсът на собственика е български: редовете на менюто се проверяват с неговите думи.
  localStorage.setItem('language', 'bg');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => {}); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

// --- Точното изречение на собственика: звездичките са на 34 и 51 ---
const SENTENCE = 'Може да добавите всяка бележка на * началния екран * като widget';
const STAR1 = SENTENCE.indexOf('*');
const STAR2 = SENTENCE.indexOf('*', STAR1 + 1);
const WALLET = '/storage/emulated/0/Download/Images/Wallet.jpg';
const FILE0000 = '/storage/emulated/0/Pictures/Images/file_0000.png';
const span8 = (start, end, paramstring, paramint) => ({ start, end, type: 8, paramstring, paramint });
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const FORMAT = fmt(span8(STAR1, STAR1 + 1, WALLET, 4), span8(STAR2, STAR2 + 1, FILE0000, 2));
const NOTE = 'Бележка|' + SENTENCE;

// --- Отваряне на бележката и влизане в редакция (истинският път: showModal + enableNoteEditing) ---
const attach = [
  { datemod: 1, description: '', gdid: 'M1', id: 1, noteid: 'G1', path: 'Wallet.jpg', pathGD: 'WALLET_NEW', type: 1 },
  { datemod: 1, description: '', gdid: 'M2', id: 2, noteid: 'G1', path: 'file_0000.png', pathGD: 'FILE0000', type: 1 },
];
const openEditor = () => page.evaluate(async ({ attach, raw, format }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  mediaData.length = 0; mediaData.push(...attach);
  // Бележката съществува в данните, както в приложението: там живеят размерите и мястото ѝ
  // (uiState), а с тях и записаната база на ширината на вградените снимки.
  if (!allNotesData.some(n => String(n.gdid) === 'G1')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G1', id: '901', notetxt: raw, numord: 901, sellist: 0, status: 0, text_span: format,
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 244,
    });
  }
  showModal({ raw, format, gdid: 'G1', id: '901' });
  enableNoteEditing(document.getElementById('modal-body'));
  // Реален размер на прозореца на бележката: без него тялото е високо колкото съдържанието си
  // (около 140px) и маркерите излизат извън видимата част.
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 30));
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const tiles = [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')];
    if (tiles.length === 2 && tiles.every(t => t.dataset.state === 'ready')) return tiles.length;
    await new Promise(r => setTimeout(r, 40));
  }
  return document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)').length;
}, { attach, raw: NOTE, format: FORMAT });

const settled = await openEditor();
// Модалът се отваря с преход (scale 0.7 -> 1): геометрията се мери само след като мащабът е 1.
const waitScale = () => page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  if (!body || !body.offsetWidth) return false;
  const scale = body.getBoundingClientRect().width / body.offsetWidth;
  if (Math.abs(scale - 1) > 0.01) return false;
  const w = body.getBoundingClientRect().width;
  const prev = window.__menuW;
  window.__menuW = w;
  return prev !== undefined && Math.abs(prev - w) < 0.5;
}, null, { timeout: 15000 }).then(() => true).catch(() => false);
const scaled = await waitScale();
await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 250)));

const state = () => page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const strip = body.querySelector('.nm-attach-strip');
  const field = document.getElementById('note-edit-textarea');
  const backdrop = document.getElementById('note-edit-textarea-backdrop');
  const menu = document.querySelector('.nm-inline-menu');
  const marks = backdrop ? [...backdrop.querySelectorAll('.nm-inline-mark')] : [];
  const rect = el => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; };
  const formats = (body.dataset.format || '').split('|').filter(Boolean).map(s => JSON.parse(s));
  return {
    editMode: body.classList.contains('nm-edit-with-strip') && !!field,
    stripShown: !!strip,
    stripRect: strip ? rect(strip) : null,
    wrapperRect: field ? rect(backdrop.parentElement.parentElement) : null,
    bodyRect: rect(body),
    boxes: field ? [...backdrop.parentElement.parentElement.children].map(b => Math.round(b.getBoundingClientRect().height)) : null,
    addTile: !!body.querySelector('.nm-attach-tile.is-add'),
    tiles: [...body.querySelectorAll('.nm-attach-tile:not(.is-add)')].map(t => ({ name: t.dataset.nmFileName, state: t.dataset.state, href: (t.parentElement.querySelector('.nm-attach-source a') || {}).href || null, hasLink: !!t.parentElement.querySelector('.nm-attach-source a') })),
    value: field ? field.value : null,
    caret: field ? [field.selectionStart, field.selectionEnd] : null,
    formats,
    images: formats.filter(f => f.type === 8).map(f => ({ start: f.start, end: f.end, paramint: f.paramint, name: (f.paramstring || '').split('/').pop() })),
    marks: marks.map(m => ({ state: m.dataset.nmMarkState, start: Number(m.dataset.nmStart), text: m.textContent, rect: rect(m), bg: getComputedStyle(m, '::after').backgroundImage.slice(0, 60), color: getComputedStyle(m).color, fontSize: getComputedStyle(m).fontSize })),
    // Ширината на един знак в същия шрифт - с нея се сравнява маркерът.
    charWidth: (() => {
      if (!backdrop) return null;
      const probe = document.createElement('span');
      probe.textContent = '*';
      const cs = getComputedStyle(backdrop);
      probe.style.font = cs.font;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      backdrop.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return Math.round(w * 100) / 100;
    })(),
    menu: menu ? {
      kind: menu.dataset.nmMenu,
      width: Math.round(menu.getBoundingClientRect().width),
      left: Math.round(menu.getBoundingClientRect().left),
      right: Math.round(menu.getBoundingClientRect().right),
      top: Math.round(menu.getBoundingClientRect().top),
      bottom: Math.round(menu.getBoundingClientRect().bottom),
      above: menu.classList.contains('is-above'),
      actions: [...menu.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction),
      labels: [...menu.querySelectorAll('.nm-inline-menu-row')].map(b => b.textContent.trim()),
      // Центрирането на текста: редовете са flex с justify-content: center.
      centers: [...menu.querySelectorAll('.nm-inline-menu-row')].map(b => ({
        text: b.textContent.trim(),
        justify: getComputedStyle(b).justifyContent,
        align: getComputedStyle(b).textAlign,
        pad: [getComputedStyle(b).paddingLeft, getComputedStyle(b).paddingRight],
        // Средата на текста спрямо средата на реда - при ляво изравняване би била вляво.
        textMid: Math.round((() => { const r = document.createRange(); r.selectNodeContents(b); const t = r.getBoundingClientRect(); return t.left + t.width / 2; })()),
        rowMid: Math.round(b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2),
      })),
      range: (() => { const r = menu.querySelector('.nm-inline-menu-range'); return r ? { min: r.min, max: r.max, step: r.step, value: r.value } : null; })(),
      values: [...menu.querySelectorAll('[data-nm-menu-value]')].map(v => v.textContent.trim()),
      ghost: (() => { const g = document.querySelector('.nm-inline-ghost'); if (!g) return null; const r = g.getBoundingClientRect(); return { width: Math.round(r.width), height: Math.round(r.height), label: g.textContent.trim() }; })(),
    } : null,
    menuCount: document.querySelectorAll('.nm-inline-menu').length,
    ghostCount: document.querySelectorAll('.nm-inline-ghost').length,
    undo: (() => { const h = document.getElementById('modal-body')._noteEditUndo; return h ? { cursor: h.cursor, total: h.entries.length } : null; })(),
  };
});

// ======================= 1. Лентата се вижда и в режим Редактиране =======================
let s = await state();
ok(scaled, 'модалът е отворен в края на прехода (мащаб 1) - иначе геометрията се мери смалена');
ok(settled === 2, `двете прикачени снимки са плочки (${settled})`);
ok(s.editMode, 'бележката е в режим Редактиране (има текстова кутия)');
ok(s.wrapperRect && s.wrapperRect.height > 150, `редакторът е с истинска височина, не смачкан (${s.wrapperRect && s.wrapperRect.height}px)`);
ok(s.stripShown, 'лентата с плочките НЕ изчезва в редакция (.nm-attach-strip е в тялото)');
ok(s.tiles.length === 2 && s.tiles.every(t => t.state === 'ready'), `и двете плочки са заредени в редакция (${JSON.stringify(s.tiles.map(t => t.state))})`);
ok(s.tiles.every(t => t.hasLink), 'всяка плочка носи истинския <a> на файла в обвивката си', s.tiles);
ok(s.addTile, 'в края на лентата има плочка „+" за нова снимка');
ok(s.stripRect && s.wrapperRect && s.stripRect.top >= s.wrapperRect.bottom - 1,
  `лентата стои ПОД кутията за редактиране (лента ${s.stripRect && s.stripRect.top}, редактор ${s.wrapperRect && s.wrapperRect.bottom})`);
ok(s.wrapperRect && s.stripRect && s.wrapperRect.height + s.stripRect.height >= s.bodyRect.height - 12,
  `редакторът и лентата изпълват тялото, без празнина (редактор ${s.wrapperRect && s.wrapperRect.height}, лента ${s.stripRect && s.stripRect.height}, тяло ${s.bodyRect && s.bodyRect.height})`, { boxes: s.boxes });
ok(s.bodyRect && s.stripRect && s.bodyRect.bottom - s.stripRect.bottom <= 24,
  `лентата е на дъното на бележката (лента ${s.stripRect && s.stripRect.bottom}, тяло ${s.bodyRect && s.bodyRect.bottom})`);
ok(s.boxes && (s.boxes.length < 2 || (s.boxes[0] >= 55 && s.boxes[1] >= 20)),
  `редът на заглавието и редът на тялото не са се слели (${JSON.stringify(s.boxes)})`);
ok(s.stripRect && s.stripRect.width > 0 && (!s.stripRect.height || s.stripRect.height < 80), `лентата е един ред (${s.stripRect && s.stripRect.height}px)`);

// ======================= 2. Маркерът в текста =======================
ok(s.marks.length === 2, `двете вградени снимки имат маркери в подложката (${s.marks.length})`);
ok(s.marks.every(m => m.state === 'ready'), `маркерите са намерили миниатюрата си (${JSON.stringify(s.marks.map(m => m.state))})`);
ok(s.marks.every(m => /^url\(/.test(m.bg)), 'миниатюрата е фонът на маркера (снимката се вижда)', s.marks.map(m => m.bg));
ok(s.marks.every(m => m.color === 'rgba(0, 0, 0, 0)'), `звездичката не се вижда като знак (color=${s.marks[0] && s.marks[0].color})`);
ok(s.charWidth > 0 && s.marks.every(m => m.rect.width <= s.charWidth * 1.6),
  `маркерът е широк един знак (${s.marks.map(m => m.rect.width)} срещу знак ${s.charWidth}px)`, { marks: s.marks.map(m => m.rect.width), charWidth: s.charWidth });
ok(s.marks.every(m => m.text === '*'), 'маркерът стои точно на мястото на звездичката (знакът е в него)', s.marks.map(m => m.text));
ok(s.value.includes('*'), 'звездичките са още в текста (записът е същият)', s.value);

// Лентата с отворените бележки вече е на екрана и при ЕДНА отворена бележка (b2.78). Тя стои в
// дъното на екрана и се рисува НАД прозорците, значи дъното на бележката не бива да влиза под нея:
// иначе редът с плочките на прикачените файлове остава зад лентата и истинско щрак с мишката не
// стига до плочката (натискът там е на лентата). Прозорецът се вдига над лентата - същото, което
// прави и потребителят, като го плъзне нагоре.
const raiseNoteAboveBar = () => page.evaluate(() => {
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  const bar = document.getElementById('open-notes-bar');
  const barTop = bar && bar.classList.contains('is-visible')
    ? bar.getBoundingClientRect().top : window.innerHeight;
  const r = box.getBoundingClientRect();
  if (r.bottom > barTop - 8) {
    const lift = r.bottom - (barTop - 8);
    const top = Math.max(0, Math.round(r.top - lift - 4));
    let h = Math.round(barTop - 8 - top);
    if (h > r.height) h = Math.round(r.height);
    box.style.top = top + 'px';
    box.style.height = h + 'px';
    box.style.maxHeight = h + 'px';
  }
  const after = box.getBoundingClientRect();
  return { barTop: Math.round(barTop), top: Math.round(after.top), bottom: Math.round(after.bottom) };
});

// ======================= 3. Плочка -> менюто (Преглед, Ширина, Сложи в текста) =======================
// Плочката трябва да е ИЗВЪН лентата, за да я стигне истински клик с мишката: прозорецът се вдига
// над лентата (иначе редът с плочките остава зад нея - тя е над прозорците в дъното на екрана).
const raisedAboveBar = await raiseNoteAboveBar();
ok(raisedAboveBar.bottom <= raisedAboveBar.barTop - 8,
  `прозорецът е вдигнат над лентата, за да е стигаема плочката (дъно ${raisedAboveBar.bottom} <= ${raisedAboveBar.barTop} - 8)`, raisedAboveBar);

const tileRect = await page.evaluate(() => {
  const tile = document.querySelector('#modal-body .nm-attach-tile:not(.is-add)');
  const r = tile.getBoundingClientRect();
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
});
if (SHOTS) await page.screenshot({ path: `${SHOTS}-1-editor-strip.png` });
// Истински щрак с мишката (единственият CDP вход): доказва, че жестът стига до плочката.
await page.mouse.click(tileRect.cx, tileRect.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
s = await state();
ok(s.menu && s.menu.kind === 'tile', `щрак върху плочка отваря менюто (${s.menu && s.menu.kind})`);
ok(s.menuCount === 1, `отворило се е едно меню (${s.menuCount})`);
ok(s.menu && s.menu.actions.join(',') === 'preview,insert,cancel', `редовете от плочка са Преглед, „Сложи в текста" и „Отказ" (${s.menu && s.menu.actions})`, s.menu && s.menu.labels);
ok(s.menu && !s.menu.actions.includes('update'),
  `в менюто от плочката НЯМА „Обнови" - там действието е „Сложи в текста" (${s.menu && s.menu.actions})`);
ok(s.menu && s.menu.actions[0] === 'preview' && s.menu.labels[0] === 'Преглед',
  `първият ред е „Преглед" (${s.menu && s.menu.labels.join(' | ')})`);
ok(s.menu && s.menu.labels.join('|') === 'Преглед|Сложи в текста|Отказ', `редовете от плочката са с думите от плана, последният е „Отказ" (${s.menu && s.menu.labels})`);
ok(s.menu && s.menu.width <= 300, `менюто не е по-широко от 300px (${s.menu && s.menu.width})`);
ok(s.menu && s.menu.range && s.menu.range.min === '10' && s.menu.range.max === '100' && s.menu.range.step === '10',
  `плъзгачът е 10..100 стъпка 10 (${s.menu && JSON.stringify(s.menu.range)})`);
ok(s.menu && s.menu.values.join('|') === '40%|40%', `менюто показва сегашната ширина на файла (${s.menu && s.menu.values})`);
// Редовете са с центриран текст, както „Махни" - не ляво изравнени (това е и забележката на собственика).
ok(s.menu && s.menu.centers.every(c => c.justify === 'center' && c.align === 'center' && Math.abs(c.textMid - c.rowMid) <= 2),
  `редовете са с центриран текст (${s.menu && JSON.stringify(s.menu.centers.map(c => [c.text, c.justify, c.align, c.textMid - c.rowMid]))})`);
ok(s.menu && (s.menu.bottom <= tileRect.cy - 4 || s.menu.top >= tileRect.cy + 4),
  `менюто излиза над плочката, без да я закрива (меню ${s.menu && s.menu.top}..${s.menu && s.menu.bottom}, плочка ${tileRect.cy})`, s.menu);
ok(s.menu && s.menu.left >= 0 && s.menu.right <= 1281, `менюто не излиза извън екрана (${s.menu && s.menu.left}..${s.menu && s.menu.right})`, s.menu);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-2-tile-menu.png` });

// ======================= 4. „Преглед" натиска истинския <a> =======================
const preview = await page.evaluate(async () => {
  const link = document.querySelector('#modal-body .nm-attach-source a');
  window.__linkClicks = 0;
  link.addEventListener('click', () => { window.__linkClicks++; }, true);
  const before = link.href;
  const btn = document.querySelector('.nm-inline-menu [data-nm-menu-action="preview"]');
  btn.click();
  const deadline = Date.now() + 8000;
  let overlay = null;
  while (Date.now() < deadline) {
    const ov = document.querySelector('#modal-body .image-preview-overlay, #content-modal .image-preview-overlay, .modal-content-box .image-preview-overlay');
    const img = ov && ov.querySelector('img');
    if (ov && img && img.getAttribute('src')) { overlay = { src: img.getAttribute('src') }; break; }
    await new Promise(r => setTimeout(r, 50));
  }
  return { clicks: window.__linkClicks, href: before, overlay, menuAfter: !!document.querySelector('.nm-inline-menu') };
});
ok(preview.clicks === 1, `„Преглед" натиска истинския <a> на файла (${preview.clicks} щракване върху ${preview.href})`);
ok(!!preview.overlay && String(preview.overlay.src).includes('WALLET_NEW'), `прегледът отваря същия файл (${preview.overlay && preview.overlay.src})`, preview);
ok(preview.menuAfter === false, 'менюто се затваря след „Преглед"');
await page.evaluate(() => document.querySelectorAll('.image-preview-overlay').forEach(o => o.remove()));

// ======================= 5. Плъзгачът: 80% -> paramint 8, число, кадър, едно стъпало ^Z =======================
const slider = await page.evaluate(async () => {
  // Отваря се пак от плочката (менюто се затвори след прегледа).
  const tile = document.querySelector('#modal-body .nm-attach-tile:not(.is-add)');
  tile.click();
  const r2 = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  const fire = (type) => r2.dispatchEvent(new Event(type, { bubbles: true }));
  r2.value = '60'; fire('input');
  const during = {
    value: document.querySelector('.nm-inline-menu [data-nm-menu-value]').textContent,
    ghost: !!document.querySelector('.nm-inline-ghost'),
    ghostLabel: (document.querySelector('.nm-inline-ghost') || {}).textContent,
    paramint: (document.getElementById('modal-body').dataset.format.match(/"type":8,"paramint":(\d+)[^}]*Wallet/) || [])[1],
    formats: (document.getElementById('modal-body').dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint),
  };
  r2.value = '80'; fire('input');
  const after = {
    value: document.querySelector('.nm-inline-menu [data-nm-menu-value]').textContent,
    values: [...document.querySelectorAll('.nm-inline-menu [data-nm-menu-value]')].map(v => v.textContent),
    ghost: !!document.querySelector('.nm-inline-ghost'),
    paramint: (document.getElementById('modal-body').dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint),
  };
  fire('change');
  const onRelease = {
    ghost: !!document.querySelector('.nm-inline-ghost'),
    undo: (() => { const h = document.getElementById('modal-body')._noteEditUndo; return h ? { cursor: h.cursor, total: h.entries.length } : null; })(),
  };
  return { during, after, onRelease };
});
ok(slider.during.value === '60%' && slider.during.ghost && slider.during.ghostLabel === '60%',
  `докато плъзгачът се мести, излиза кадър с новата ширина (${slider.during.ghostLabel})`, slider.during);
ok(slider.during.formats.join(',') === '6,2', `плъзгането пише paramint 6 на този файл и не пипа другия (${slider.during.formats})`);
ok(slider.after.values.join('|') === '80%|80%', `числото се вижда под плъзгача (${slider.after.values})`);
ok(slider.after.paramint.join(',') === '8,2', `80% -> paramint 8, а другият маркер остава 2 (${slider.after.paramint})`);
ok(slider.onRelease.ghost === false, 'кадърът изчезва при пускане', slider.onRelease);
ok(slider.onRelease.undo && slider.onRelease.undo.total >= 2 && slider.onRelease.undo.cursor === slider.onRelease.undo.total - 1,
  `всяка смяна на ширината е едно стъпало за отмяна (${JSON.stringify(slider.onRelease.undo)})`);
// ^Z връща предишната ширина, ^Y пак я слага.
const undone = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const widths = () => (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint);
  undoNoteEdit(body);
  const back = widths();
  redoNoteEdit(body);
  const again = widths();
  // Менюто се затваря, преди да се отвори пак: втори щрак на същия ред го затваря (както в приложението).
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  return { back, again, menuAfterEscape: !!document.querySelector('.nm-inline-menu') };
});
ok(undone.menuAfterEscape === false, 'Escape затваря менюто');
ok(undone.back.join(',') === '4,2' && undone.again.join(',') === '8,2',
  `^Z връща предишната ширина, ^Y я слага пак (${undone.back} -> ${undone.again})`);

// Рендира бележката в режим преглед (без редактор) през ИСТИНСКИЯ път - бутонът „Преглед" (окото)
// в редактора. Само активният прозорец носи id="modal-body", затова след рендера се ползва
// глобалният modalBody - точно както го прави приложението.
const renderNoteView = () => page.evaluate(async () => {
  if (typeof previewEditedNote !== 'function') return { missing: true };
  previewEditedNote();
  const body = (typeof modalBody !== 'undefined' && modalBody) ? modalBody : document.getElementById('modal-body');
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.width = '900px';
  box.style.maxWidth = '900px';
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const boxes = [...body.querySelectorAll('.nm-inline-img[data-nm-view="note"]')];
    if (boxes.length && boxes.every(b => b.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => setTimeout(r, 80));
  const column = () => {
    const c = getComputedStyle(body);
    return Math.round(body.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight));
  };
  const read = () => [...body.querySelectorAll('.nm-inline-img[data-nm-view="note"]')].map(b => ({
    file: b.dataset.nmFile,
    style: b.style.width,
    px: Math.round(b.getBoundingClientRect().width),
    natural: b.querySelector('img') ? b.querySelector('img').naturalWidth : null,
    base: b.dataset.nmBase || null,
    baseUsed: b.dataset.nmBaseUsed || null,
    pct: b.dataset.nmPct,
    column: column(),
  }));
  const wide = read();
  // По-широк прозорец на бележката: снимките, които се побират, не бива да мърдат.
  box.style.width = '1200px';
  box.style.maxWidth = '1200px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 60));
  const wider = read();
  // И по-тясна бележка от изчислената ширина: тук снимките се свиват, за да се поберат.
  box.style.width = '160px';
  box.style.maxWidth = '160px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 60));
  const cramped = read();
  box.style.width = ''; box.style.maxWidth = '';
  return {
    wide, wider, cramped, column: column(),
    diag: {
      hasEditor: !!body.querySelector('textarea'), bodyClass: body.className, bodyId: body.id,
      anyInline: body.querySelectorAll('.nm-inline-img').length,
      allInline: document.querySelectorAll('.nm-inline-img').length,
      text: body.textContent.slice(0, 160),
    },
  };
});

// ======================= 6. „Сложи в текста": звездичка на каретата, paramint 3 =======================
const inserted = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  const before = field.value;
  const beforeImages = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).length;
  // Каретата се слага в края на втория ред („като widget") - там няма код и няма заглавие.
  const pos = before.indexOf('widget') !== -1 ? before.indexOf('widget') + 'widget'.length : before.length;
  field.focus();
  field.setSelectionRange(pos, pos);
  // Менюто се отваря от плочката (то е същото, което собственикът щраква), а плъзгачът се слага
  // изрично на 30%: от 23.10 вмъкването взема стойността на плъзгача, а тя помни последния избор
  // (в раздел 5 плъзгачът беше оставен на 80%).
  const tile = document.querySelector('#modal-body .nm-attach-tile:not(.is-add)');
  tile.click();
  const rangeFor30 = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  rangeFor30.value = '30';
  rangeFor30.dispatchEvent(new Event('input', { bubbles: true }));
  rangeFor30.dispatchEvent(new Event('change', { bubbles: true }));
  const shownBeforeInsert = (document.querySelector('.nm-inline-menu [data-nm-menu-value]') || {}).textContent;
  const insertBtn = document.querySelector('.nm-inline-menu [data-nm-menu-action="insert"]');
  const hadButton = !!insertBtn;
  insertBtn.click();
  // Базата на ширината се пита по мрежата (естествената ширина на снимката), затова се изчаква.
  const deadline = Date.now() + 6000;
  let formats = [];
  while (Date.now() < deadline) {
    formats = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x));
    if (formats.some(f => f.type === 8 && f.start === pos)) break;
    await new Promise(r => setTimeout(r, 40));
  }
  return {
    hadButton,
    shownBeforeInsert,
    pos,
    starAt: field.value[pos],
    lengthDelta: field.value.length - before.length,
    value: field.value,
    newImage: formats.filter(f => f.type === 8).find(f => f.start === pos) || null,
    images: formats.filter(f => f.type === 8).map(f => ({ start: f.start, paramint: f.paramint, name: (f.paramstring || '').split('/').pop() })),
    beforeImages,
    caret: [field.selectionStart, field.selectionEnd],
    column: (() => { const cs = getComputedStyle(field); return Math.round(field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)); })(),
    storedBase: nmInlineBaseWidth(body, 'Wallet.jpg'),
    after: null,
  };
});
ok(inserted.hadButton, 'менюто от плочката има ред „Сложи в текста"');
ok(inserted.shownBeforeInsert === '30%', `преди вмъкването плъзгачът е на 30% (${inserted.shownBeforeInsert})`);
ok(inserted.starAt === '*' && inserted.lengthDelta === 1,
  `„Сложи в текста" слага звездичка на каретата (знак „${inserted.starAt}", дължина +${inserted.lengthDelta})`, inserted);
ok(inserted.newImage && inserted.newImage.paramint === 3,
  `новият запис е type=8 с paramint 3 (30%) на същото място (${JSON.stringify(inserted.newImage)})`, inserted.images);
ok(inserted.newImage && inserted.newImage.paramstring === 'Wallet.jpg',
  `записът носи името на файла, не целия път (${inserted.newImage && inserted.newImage.paramstring})`);
ok(inserted.images.length === inserted.beforeImages + 1, `местата на снимки стават ${inserted.images.length} (${inserted.images.map(i => i.paramint)})`);
ok(inserted.caret[0] === inserted.pos + 1, `каретата остава след новата снимка (${inserted.caret})`);
// Базата: естествената ширина на снимката (постоянна величина), не ширината на бележката. Снимката е
// широка 4000px, значи базата е 4000 дори при колона 350px - и се пази при размерите на бележката.
ok(inserted.storedBase === 4000 && inserted.column < 4000,
  `базата на ширината се пази: 4000px, не колоната ${inserted.column}px (${inserted.storedBase})`, { inserted });

// Новото място има маркер и той показва същата снимка.
const markers = await page.evaluate(async ({ pos }) => {
  const body = document.getElementById('modal-body');
  const mark = document.querySelector(`#note-edit-textarea-backdrop .nm-inline-mark[data-nm-start="${pos}"]`);
  if (!mark) return { missing: true };
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (mark.dataset.nmMarkState === 'ready') break;
    await new Promise(r => setTimeout(r, 50));
  }
  const r = mark.getBoundingClientRect();
  return { state: mark.dataset.nmMarkState, file: mark.dataset.nmFile, text: mark.textContent, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), width: Math.round(r.width) };
}, { pos: inserted.pos });
ok(!markers.missing && markers.state === 'ready' && markers.file === 'Wallet.jpg',
  `новото място има маркер от един знак със същата снимка (${JSON.stringify(markers)})`);
// Менюто се отваря и от самия маркер - с истинско щракване с мишката върху него.
const hit = await page.evaluate(({ cx, cy }) => {
  const el = document.elementFromPoint(cx, cy);
  const field = document.getElementById('note-edit-textarea');
  const r = field.getBoundingClientRect();
  return { tag: el ? el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '') : null, field: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
}, markers);
await page.mouse.click(markers.cx, markers.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
s = await state();
ok(s.menu && s.menu.kind === 'marker', `щрак върху маркера отваря менюто (${s.menu && s.menu.kind})`, hit);
ok(s.menu && s.menu.actions.join(',') === 'remove,update,cancel', `редовете от маркера са „Махни", „Обнови" и „Отказ" (${s.menu && s.menu.actions})`, s.menu && s.menu.labels);
ok(s.menu && s.menu.labels.join('|') === 'Махни|Обнови|Отказ', `редовете от маркера са с думите от плана, последният е „Отказ" (${s.menu && s.menu.labels})`);
ok(s.menu && !s.menu.actions.includes('preview'), `в менюто от маркера НЯМА „Преглед" (${s.menu && s.menu.actions})`);
ok(s.menu && s.menu.actions[s.menu.actions.length - 2] === 'update' && s.menu.actions[s.menu.actions.length - 1] === 'cancel',
  `„Обнови" е предпоследният ред, а последният е „Отказ" (${s.menu && s.menu.actions})`);
ok(s.menu && s.menu.actions.includes('update') && s.menu.labels.includes('Обнови'),
  `редът „Обнови" е с думата от i18n (${s.menu && s.menu.labels})`);
ok(s.menu && s.menu.values.join('|') === '30%|30%', `менюто от маркера показва ширината на това място (${s.menu && s.menu.values})`);
ok(s.menu && s.caret && Math.abs(s.caret[0] - markersStart(inserted.pos)) <= 2, `щракът на маркера слага каретата там (${s.caret})`, { pos: inserted.pos });
function markersStart(pos) { return pos; }
ok(s.menu && s.menu.centers.every(c => c.justify === 'center' && c.align === 'center' && Math.abs(c.textMid - c.rowMid) <= 2),
  `и редовете от маркера са с центриран текст (${s.menu && JSON.stringify(s.menu.centers.map(c => c.textMid - c.rowMid))})`);
ok(s.menu && (s.menu.bottom <= markers.cy - 4 || s.menu.top >= markers.cy + 4),
  `менюто излиза под/над маркера, без да го закрива (меню ${s.menu && s.menu.top}..${s.menu && s.menu.bottom}, маркер ${markers.cy})`, s.menu);
ok(s.menu && s.menu.centers && s.menu.centers.length === 3,
  `от маркера са три реда - „Махни", „Обнови" и „Отказ" (${s.menu && s.menu.centers.length})`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-3-marker-menu.png` });

// От маркера се пипа само това място.
const markerWidth = await page.evaluate(() => {
  const r = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));
  const body = document.getElementById('modal-body');
  return (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => ({ start: f.start, paramint: f.paramint }));
});
ok(markerWidth.find(f => f.start === inserted.pos).paramint === 10, `от маркера ширината стига 100% (paramint 10) (${JSON.stringify(markerWidth)})`);
ok(markerWidth.every(f => f.start === inserted.pos || f.paramint !== 10), `от маркера НЕ се пипат другите места (${JSON.stringify(markerWidth)})`);

// ======================= 7. „Махни" маха само това място =======================
const removed = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  const imagesBefore = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8);
  const value = field.value;
  const btn = document.querySelector('.nm-inline-menu [data-nm-menu-action="remove"]');
  btn.click();
  await new Promise(r => setTimeout(r, 60));
  const imagesAfter = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8);
  return {
    before: imagesBefore.length,
    after: imagesAfter.length,
    value,
    valueAfter: field.value,
    stars: (field.value.match(/\*/g) || []).length,
    images: imagesAfter.map(f => ({ start: f.start, paramint: f.paramint, name: (f.paramstring || '').split('/').pop() })),
    tiles: [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')].map(t => t.dataset.nmFileName),
    marks: document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark').length,
    menu: !!document.querySelector('.nm-inline-menu'),
    lenDelta: field.value.length - value.length,
  };
});
ok(removed.after === removed.before - 1, `„Махни" маха точно едно място (${removed.before} -> ${removed.after})`);
ok(removed.stars === 2 && removed.lenDelta === -1, `от текста пада само звездичката на това място (звезди: ${removed.stars})`, removed);
ok(removed.images.filter(i => i.name === 'Wallet.jpg').length === 1 && removed.images.filter(i => i.name === 'file_0000.png').length === 1,
  `другото място и другата снимка остават (${JSON.stringify(removed.images)})`);
ok(removed.tiles.length === 2, `файлът остава в лентата (${removed.tiles.join(', ')})`);
ok(removed.marks === 2, `остават два маркера (${removed.marks})`);
ok(removed.menu === false, 'менюто се затваря след „Махни"');
ok(removed.valueAfter.includes('widget') && removed.valueAfter.includes('началния екран'),
  'останалият текст е непокътнат', removed.valueAfter);

// ======================= 8. Менюто при тясна бележка =======================
const narrow = await page.evaluate(async () => {
  // Маркер без файл: менюто казва „няма такъв файл", „Махни" работи.
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  const missing = { start: 0, end: 1, type: 8, paramstring: '', paramint: 5 };
  const formats = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x));
  formats.push(missing);
  field.value = '*' + field.value;
  body.dataset.format = formats.map(f => JSON.stringify(f)).join('|');
  field.dataset.lastVal = field.value;
  handleEditInput(field, document.getElementById('note-edit-textarea-backdrop'));
  await new Promise(r => setTimeout(r, 40));
  const mark = document.querySelector('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-start="0"]');
  return { has: !!mark, missingClass: mark ? mark.classList.contains('is-missing') : null };
});
ok(narrow.has && narrow.missingClass, `маркер без файл е пунктир с „?" (${JSON.stringify(narrow)})`);
// Тясна карта на борда: същата бележка, но широка 300px - тогава колоната е ~270px.
await page.evaluate(async () => {
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  box.style.width = '300px';
  box.style.maxWidth = '300px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 30));
});
const narrowHit = await page.evaluate(() => {
  const mark = document.querySelector('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-start="0"]');
  mark.scrollIntoView({ block: 'center' });
  const r = mark.getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), tag: el ? el.tagName : null };
});
await page.mouse.click(narrowHit.cx, narrowHit.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const narrowMenu = await page.evaluate(() => {
  const m = document.querySelector('.nm-inline-menu');
  if (!m) return { missing: true };
  const body = document.getElementById('modal-body').getBoundingClientRect();
  const r = m.getBoundingClientRect();
  return {
    width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
    column: [Math.round(body.left), Math.round(body.right), Math.round(body.width)],
    inner: window.innerWidth,
    fitsViewport: r.left >= 0 && r.right <= window.innerWidth + 1,
    withinColumn: r.left >= body.left - 1 && r.right <= body.right + 1,
    labels: [...m.querySelectorAll('.nm-inline-menu-row')].map(b => b.textContent.trim()),
    actions: [...m.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction),
    note: (m.querySelector('.nm-inline-menu-note') || {}).textContent || null,
  };
});
ok(!narrowMenu.missing && narrowMenu.width <= 300 && narrowMenu.width <= narrowMenu.column[2],
  `на тясна бележка менюто е колкото нея и не повече от 300px (${narrowMenu.width}px при колона ${narrowMenu.column && narrowMenu.column[2]}px)`, { narrowMenu, narrowHit });
ok(!narrowMenu.missing && narrowMenu.fitsViewport && narrowMenu.withinColumn,
  `менюто не излиза нито извън бележката, нито извън екрана (меню ${narrowMenu.left}..${narrowMenu.right}, колона ${narrowMenu.column})`, { narrowMenu, narrowHit });
ok(!narrowMenu.missing && narrowMenu.note && /Images|файл/i.test(narrowMenu.note),
  `при маркер без файл менюто казва защо (${narrowMenu.note})`, narrowMenu);
ok(!narrowMenu.missing && narrowMenu.actions.join(',') === 'remove,update,cancel',
  `и там редовете са „Махни", „Обнови" и „Отказ", без „Преглед" (${narrowMenu.actions})`);
const removedMissing = await page.evaluate(() => {
  const before = (document.getElementById('modal-body').dataset.format || '').split('|').filter(Boolean).length;
  document.querySelector('.nm-inline-menu [data-nm-menu-action="remove"]').click();
  const after = (document.getElementById('modal-body').dataset.format || '').split('|').filter(Boolean).length;
  return { before, after, value: document.getElementById('note-edit-textarea').value.slice(0, 20) };
});
ok(removedMissing.after === removedMissing.before - 1, `„Махни" работи и за маркер без файл (${removedMissing.before} -> ${removedMissing.after})`);
// Прозорецът се връща към широката бележка за проверките с пейста и влаченето.
await page.evaluate(async () => {
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  box.style.width = '';
  box.style.maxWidth = '';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 30));
});

// ======================= 9. Пейст и влачене влизат само в лентата =======================
const drop = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const formatsBefore = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).length;
  const calls = [];
  const real = window.attachFilesToModal;
  window.attachFilesToModal = (files) => { calls.push(Array.from(files).map(f => f.name)); return Promise.resolve(); };
  const dt = new DataTransfer();
  dt.items.add(new File(['x'], 'nova.jpg', { type: 'image/jpeg' }));
  const make = (type, withFiles) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: withFiles ? dt : new DataTransfer() });
    if (type === 'paste') Object.defineProperty(ev, 'clipboardData', { value: withFiles ? dt : new DataTransfer() });
    return ev;
  };
  body.dispatchEvent(make('dragover', true));
  const over = body.classList.contains('nm-file-drop');
  body.dispatchEvent(make('drop', true));
  const afterDrop = !body.classList.contains('nm-file-drop');
  // Пейст на файл и пейст на текст.
  const pasteFile = make('paste', true);
  body.dispatchEvent(pasteFile);
  const pasteText = make('paste', false);
  body.dispatchEvent(pasteText);
  await new Promise(r => setTimeout(r, 50));
  window.attachFilesToModal = real;
  const formatsAfter = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).length;
  return {
    over, afterDrop, calls,
    dropPrevented: null,
    pasteFilePrevented: pasteFile.defaultPrevented,
    pasteTextPrevented: pasteText.defaultPrevented,
    formatsBefore, formatsAfter,
  };
});
ok(drop.calls.length === 2 && drop.calls.every(c => c[0] === 'nova.jpg'),
  `влачене и пейст на файл качват файла (${JSON.stringify(drop.calls)})`);
ok(drop.over && drop.afterDrop, 'влаченето на файл маркира редактора, докато е над него', drop);
ok(drop.pasteFilePrevented === true && drop.pasteTextPrevented === false,
  'пейстът на ФАЙЛ се прихваща, а пейстът на текст си остава както досега', drop);
ok(drop.formatsAfter === drop.formatsBefore, `нито влаченето, нито пейстът пишат type=8 (${drop.formatsBefore} -> ${drop.formatsAfter})`);

// ======================= 9б. Вмъкване в {{ }} е отказано =======================
const refused = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  const before = { value: field.value, format: body.dataset.format || '' };
  const beforeCount = (before.format.split('|').filter(Boolean).length);
  const guard = {
    inside: nmInlineInsideCode('а {{код}} б', 5),
    before: nmInlineInsideCode('а {{код}} б', 0),
    fence: nmInlineInsideCode('```\nкод\n```', 5),
  };
  // Код в бележката, каретата ВЪТРЕ в него: редът „Сложи в текста" не бива да слага маркер там.
  field.value = 'а {{код}} б';
  field.dataset.lastVal = field.value;
  handleEditInput(field, document.getElementById('note-edit-textarea-backdrop'));
  field.focus();
  field.setSelectionRange(5, 5);
  const tile = document.querySelector('#modal-body .nm-attach-tile:not(.is-add)');
  tile.click();
  const btn = document.querySelector('.nm-inline-menu [data-nm-menu-action="insert"]');
  btn.click();
  await new Promise(r => setTimeout(r, 300));
  const after = { value: field.value, count: (body.dataset.format || '').split('|').filter(Boolean).length };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  // Състоянието се връща, за да продължат проверките след това.
  field.value = before.value;
  field.dataset.lastVal = before.value;
  body.dataset.format = before.format;
  handleEditInput(field, document.getElementById('note-edit-textarea-backdrop'));
  return { guard, beforeCount, after, restored: field.value === before.value };
});
ok(refused.guard.inside === true && refused.guard.before === false && refused.guard.fence === true,
  `вътре в {{ }} или в ограден код не се слага маркер (${JSON.stringify(refused.guard)})`, refused.guard);
ok(refused.after.value === 'а {{код}} б' && refused.after.count === refused.beforeCount,
  `каретата вътре в {{ }}: вмъкването е отказано, кодът е непокътнат (${refused.after.value}, места ${refused.after.count})`, refused);
ok(refused.restored, 'бележката е върната както беше за следващите проверки');

// ======================= 10. Ширината в бележката идва от записана база, на борда - от колоната =====
// Решение на собственика (22.10, уточнено): базата е САМО естествената ширина на снимката - постоянна
// величина - и се ЗАПИСВА в бележката (uiState.imgbase). Ширината на бележката НЕ влиза в базата: тя
// се мени с прозореца, а един и същ paramint трябва да дава един и същ резултат. Ширината в пиксели е
// (paramint/10) × базата; само по-тясна бележка я свива (max-width: 100%).
// Стара бележка без записана база пада на естествената ширина. На борда остава процент от колоната.
const inserts = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  if (!body || !field) return { missing: true };
  const cs = getComputedStyle(field);
  const column = Math.round(field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  const formats = () => (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x));
  const insertAt = async (name, pos) => {
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')].find(t => t.dataset.nmFileName === name);
    field.focus();
    field.setSelectionRange(pos, pos);
    tile.click();
    const btn = document.querySelector('.nm-inline-menu [data-nm-menu-action="insert"]');
    if (!btn) return null;
    // Ширината се избира на плъзгача ПРЕДИ вмъкването - вмъкването вече взема неговата стойност.
    const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
    range.value = '30';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    btn.click();
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const hit = formats().find(f => f.type === 8 && f.start === pos);
      if (hit) return hit;
      await new Promise(r => setTimeout(r, 40));
    }
    return null;
  };
  // Малката снимка (300px) влиза в широка бележка - базата е самата снимка.
  const small = await insertAt('file_0000.png', 0);
  // Голямата (4000px) влиза в края на бележката - базата пак е самата снимка (4000), не колоната.
  const bigPos = field.value.length;
  const big = await insertAt('Wallet.jpg', bigPos);
  return { column, small, big, text: field.value, format: body.dataset.format || '' };
});
ok(!inserts.missing && inserts.small && inserts.small.paramint === 3 && inserts.big && inserts.big.paramint === 3,
  `нова снимка влиза с 30% (paramint 3) (${inserts.small && inserts.small.paramint}, ${inserts.big && inserts.big.paramint})`);
// Записът в бележката носи само paramint: базата НЕ е ново поле в text_span.
const recordKeys = Object.keys(inserts.small || {}).sort().join(',');
ok(recordKeys === 'end,paramint,paramstring,start,type',
  `в записа на мястото има само start/end/type/paramint/paramstring - без ново поле за базата (${recordKeys})`, inserts.small);
// Базата живее при размерите и мястото на бележката (uiState.imgb), не в бележката.
const stored = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const note = allNotesData.find(n => String(n.gdid) === 'G1');
  return {
    small: nmInlineBaseWidth(body, 'file_0000.png'),
    big: nmInlineBaseWidth(body, 'Wallet.jpg'),
    imgbase: (note && note.uiState && note.uiState.imgbase) || null,
    textSpanHasBase: /parambase|imgbase|imgb/.test(note ? String(note.text_span) : ''),
    textSpan: note ? String(note.text_span) : null,
  };
});
ok(stored.small === 300, `малката снимка (300px) в бележка с колона ${inserts.column}px: базата е 300, не колоната (${stored.small})`, stored);
ok(stored.big === 4000 && inserts.column < 4000,
  `голямата снимка (4000px): базата е 4000, не ширината на бележката ${inserts.column}px (${stored.big})`, { stored, column: inserts.column });
ok(stored.imgbase && stored.imgbase['file_0000.png'] === 300 && stored.imgbase['Wallet.jpg'] === 4000,
  `базата стои при размерите на бележката, до името на файла (${JSON.stringify(stored.imgbase)})`, stored);
ok(stored.textSpanHasBase === false, 'в text_span няма поле за база (само paramint)', stored);

// Базата минава през самия запис на бележката и през JSON-а ѝ (saveEditedNote, ред ~27285).
// После сесията се чисти, тоест ширината може да дойде само от JSON-а на бележката.
const persisted = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const note = allNotesData.find(n => String(n.gdid) === 'G1');
  // Точно съставът на uiState при запис: normalizeNoteUiState + applyNoteCalDraft.
  note.uiState = applyNoteCalDraft({
    ...normalizeNoteUiState(note.uiState), exp: false
  }, { time: '', repeat: null });
  // Сякаш бележката идва от диска: само JSON.
  const fromDisk = JSON.parse(JSON.stringify(note));
  allNotesData[allNotesData.findIndex(n => String(n.gdid) === 'G1')] = fromDisk;
  nmInlineBaseFallback.clear();
  return {
    imgbase: (fromDisk.uiState && fromDisk.uiState.imgbase) || null,
    textSpanHasBase: /parambase|imgbase/.test(String(fromDisk.text_span || '')),
    small: nmInlineBaseWidth(body, 'file_0000.png'),
    big: nmInlineBaseWidth(body, 'Wallet.jpg'),
  };
});
ok(persisted.imgbase && persisted.imgbase['file_0000.png'] === 300 && persisted.imgbase['Wallet.jpg'] === 4000,
  `базата оцелява записа и JSON-а на бележката (${JSON.stringify(persisted.imgbase)})`, persisted);
ok(persisted.textSpanHasBase === false, 'след записа в text_span пак няма поле за база', persisted);
ok(persisted.small === 300 && persisted.big === 4000,
  `след като сесията е изчистена, ширината идва от JSON-а на бележката (${persisted.small}, ${persisted.big})`, persisted);

// Режим преглед на същата бележка - през бутона „Преглед" (окото) в редактора.
// Сякаш бележката е презаредена: сесийното резервно помнене се чисти - базата трябва да дойде
// от JSON-а на бележката (uiState), не от паметта на тази сесия.
await page.evaluate(() => { nmInlineBaseFallback.clear(); });
const view = await renderNoteView();
const frames = view.wide;
ok(frames.length === 4, `всичките четири места на снимки се показват в бележката (${frames.length})`, { frames, diag: view.diag });
ok(frames.every(f => f.style.endsWith('px') && f.px > 0),
  `в бележката ширината е в пиксели, не в проценти от колоната (${frames.map(f => f.style)})`, frames);
// Всяка рамка: (paramint/10) × базата, а ако не се побира - колоната на бележката.
const computedPx = (f) => Math.round((Number(f.baseUsed) || Number(f.natural)) * Number(f.pct) / 100);
const expectPx = (f) => Math.min(computedPx(f), f.column);
ok(frames.every(f => Math.abs(f.px - expectPx(f)) <= 2),
  `ширината на всяка снимка е (paramint/10) × базата: ${frames.map(f => `${f.file} ${f.pct}% от база ${f.baseUsed} = ${f.px}px`).join(' | ')}`, frames);
const smallFrame = frames.find(f => f.file === 'file_0000.png' && Number(f.base) === 300);
ok(!!smallFrame && smallFrame.px === 90,
  `малката снимка (записана база 300): 30% от 300 = 90px (${smallFrame && smallFrame.px}px)`, frames);
const bigFrame = frames.find(f => f.file === 'Wallet.jpg' && f.pct === '30' && Number(f.base) === 4000);
ok(!!bigFrame && bigFrame.px === Math.min(Math.round(4000 * 0.3), Number(bigFrame.column)),
  `голямата снимка (записана база 4000 = ширината на снимката): 30% = 1200px, свити до колоната ${bigFrame && bigFrame.column}px (${bigFrame && bigFrame.px}px)`, { bigFrame, frames });
// Стара бележка без записана база: пада на естествената ширина на снимката.
const oldNote = await page.evaluate(async ({ raw, format }) => {
  // Друга бележка (друг gdid), без база в размерите ѝ: рисува се в свой прозорец.
  const openCount = allNotesData.length;
  showModal({ raw, format, gdid: 'G_OLD', id: 'old-1' });
  const body = (typeof modalBody !== 'undefined' && modalBody) ? modalBody : document.getElementById('modal-body');
  if (allNotesData.length === openCount) {
    allNotesData.push({ gdid: 'G_OLD', id: 'old-1', notetxt: raw, text_span: format, title_span: '', uiState: {}, version: 1 });
  }
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.width = '900px';
  box.style.maxWidth = '900px';
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const boxes = [...body.querySelectorAll('.nm-inline-img[data-nm-view="note"]')];
    if (boxes.length && boxes.every(b => b.dataset.nmState !== 'loading')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  // Прозорецът се отваря със смаляване (scale 0.7 -> 1): геометрията се мери чак на мащаб 1.
  while (Date.now() < deadline) {
    const scale = box.getBoundingClientRect().width / (box.offsetWidth || 1);
    if (Math.abs(scale - 1) < 0.01) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  await new Promise(r => setTimeout(r, 60));
  const cs = getComputedStyle(body);
  const column = Math.round(body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  return [...body.querySelectorAll('.nm-inline-img[data-nm-view="note"]')].map(b => ({
    file: b.dataset.nmFile,
    style: b.style.width,
    px: Math.round(b.getBoundingClientRect().width),
    natural: b.querySelector('img') ? b.querySelector('img').naturalWidth : null,
    base: b.dataset.nmBase || null,
    baseUsed: b.dataset.nmBaseUsed || null,
    pct: b.dataset.nmPct,
    column,
  }));
}, { raw: 'Стара бележка|' + SENTENCE, format: FORMAT });
ok(oldNote.length === 2 && oldNote.every(f => !f.base),
  `стара бележка: няма записана база (${oldNote.map(f => f.base)})`, oldNote);
const oldSmall = oldNote.find(f => f.file === 'file_0000.png');
ok(!!oldSmall && oldSmall.px === 60 && Number(oldSmall.baseUsed) === 300,
  `старо място без база пада на естествената ширина: 20% от 300 = 60px (${oldSmall && oldSmall.px}px, ползвана база ${oldSmall && oldSmall.baseUsed})`, oldNote);
const oldBig = oldNote.find(f => f.file === 'Wallet.jpg');
ok(!!oldBig && Number(oldBig.baseUsed) === 4000 && Math.abs(oldBig.px - Math.min(Math.round(4000 * Number(oldBig.pct) / 100), oldBig.column)) <= 4,
  `старо място на голяма снимка: смята се от 4000px и се свива до колоната ${oldBig && oldBig.column}px (${oldBig && oldBig.px}px)`, oldNote);
// Прозорецът на бележката се мени: снимките, които се побират, не мърдат.
ok(view.wider.every((f, i) => computedPx(frames[i]) > frames[i].column || f.px === frames[i].px),
  `по-широк прозорец НЕ мени ширината на снимките, които се побират (${frames.map((f, i) => f.px + '->' + view.wider[i].px).join(', ')})`, { wide: frames, wider: view.wider });
ok(view.wider[0].column > frames[0].column, `колоната наистина е станала по-широка (${frames[0].column} -> ${view.wider[0].column})`);
ok(view.wider.some((f, i) => f.px > frames[i].px),
  `свитата до колоната снимка расте с нея (${frames.map((f, i) => f.px + '->' + view.wider[i].px).join(', ')})`);
// По-тясна бележка от изчислената ширина: снимките се свиват, за да се поберат.
ok(view.cramped.every(f => f.px <= f.column + 1),
  `по-тясна бележка свива снимките, за да се поберат (${view.cramped.map(f => f.px + 'px при колона ' + f.column).join(', ')})`, view.cramped);
ok(view.cramped.every((f, i) => f.px <= frames[i].px),
  'нито една не расте в по-тясна бележка', { cramped: view.cramped, wide: frames });

// На борда ширината остава процент от колоната (картата следва колоната си).
const board = await page.evaluate(async ({ sentence, format }) => {
  isOffline = false;
  let host = document.getElementById('inline-menu-board-host');
  if (!host) { host = document.createElement('div'); host.id = 'inline-menu-board-host'; document.body.appendChild(host); }
  const build = async (width) => {
    host.innerHTML = '';
    host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:400px;display:flex;flex-direction:column;z-index:99999;background:#fff;`;
    const board0 = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
    const id = 930000 + Math.floor(Math.random() * 50000);
    const nt = {
      alarm_type: -1, boardid: board0.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
      eventId: 0, gdid: 'probe' + id, id, notetxt: 'Бележка|' + sentence, numord: id, sellist: 0, status: 0,
      text_span: format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    el.style.display = 'flex';
    el.style.contentVisibility = 'visible';
    host.appendChild(el);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const b = el.querySelector('.nm-inline-img');
      if (b && b.dataset.nmState !== 'loading') break;
      await new Promise(r => setTimeout(r, 40));
    }
    const b = el.querySelector('.nm-inline-img');
    const content = el.querySelector('.note-content');
    const cs = getComputedStyle(content);
    const inner = content.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return {
      style: b ? b.style.width : null,
      view: b ? (b.dataset.nmView || null) : undefined,
      base: b ? (b.dataset.nmBase || null) : null,
      px: b ? Math.round(b.getBoundingClientRect().width) : null,
      pct: b && inner ? Math.round((b.getBoundingClientRect().width / inner) * 1000) / 10 : null,
      column: Math.round(inner),
    };
  };
  const wide = await build(620);
  const narrow = await build(250);
  host.remove();
  return { wide, narrow };
}, { sentence: SENTENCE, format: FORMAT });
ok(board.wide.style === '40%' && board.narrow.style === '40%' && !board.wide.base && !board.narrow.base,
  `на борда рамката остава процент от колоната и няма записана база (${board.wide.style}, ${board.narrow.style})`, board);
ok(!board.wide.view && !board.narrow.view, `на борда няма data-nm-view="note" (${board.wide.view}, ${board.narrow.view})`);
ok(Math.abs(board.wide.pct - 40) <= 2 && Math.abs(board.narrow.pct - 40) <= 2,
  `на борда снимката следва ширината на колоната си, не естествената си ширина (40% от ${board.wide.column}px = ${board.wide.px}px)`, board);

// ======================= 11. Вмъкването от плочката спазва плъзгача (бъгът от 23.10) =============
// Собственикът: „независимо каква стойност сложа за проценти от менюто на иконата в лентата -
// винаги се вмъква с 30%". Затова вмъкването се проверява на чиста бележка (свой прозорец), за да
// не размества броевете на предишните проверки: 30 -> paramint 3, 70 -> 7, 100 -> 10.
const sliderInsert = await page.evaluate(async ({ raw, format, attach }) => {
  // Прикачените файлове се търсят по noteid (= gdid), затова новата бележка получава свои записи,
  // преди лентата ѝ да се построи.
  if (!mediaData.some(m => m.noteid === 'G_SLIDER')) {
    attach.forEach(a => mediaData.push({ ...a, id: a.id + 500, noteid: 'G_SLIDER' }));
  }
  showModal({ raw, format, gdid: 'G_SLIDER', id: 'slider-1' });
  const body = document.getElementById('modal-body');
  if (!allNotesData.some(n => String(n.gdid) === 'G_SLIDER')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G_SLIDER', id: 'slider-1', notetxt: raw, numord: 902, sellist: 0, status: 0,
      text_span: format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 1,
    });
  }
  enableNoteEditing(body);
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 30));
  // Плочките се строят веднага, но файлът им се чете по мрежата: изчаква се да са готови, преди
  // да се щракне върху тях (иначе лентата още е празна).
  const tileDeadline = Date.now() + 8000;
  while (Date.now() < tileDeadline) {
    const tiles = [...body.querySelectorAll('.nm-attach-tile:not(.is-add)')];
    if (tiles.length === 2 && tiles.every(t => t.dataset.state === 'ready')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  const formats = () => (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x));
  const field = document.getElementById('note-edit-textarea');
  const out = [];
  for (const pct of ['30', '70', '100']) {
    const pos = field.value.length;
    const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')]
      .find(t => t.dataset.nmFileName === 'Wallet.jpg');
    field.focus();
    field.setSelectionRange(pos, pos);
    tile.click();
    const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
    range.value = pct;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    const shown = (document.querySelector('.nm-inline-menu [data-nm-menu-value]') || {}).textContent || null;
    const record = { pct, shown };
    document.querySelector('.nm-inline-menu [data-nm-menu-action="insert"]').click();
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const hit = formats().find(f => f.type === 8 && f.start === pos);
      if (hit) { record.paramint = hit.paramint; record.start = hit.start; break; }
      await new Promise(r => setTimeout(r, 40));
    }
    out.push(record);
  }
  return {
    rows: out,
    images: formats().filter(f => f.type === 8).map(f => ({ start: f.start, paramint: f.paramint })),
    menu: !!document.querySelector('.nm-inline-menu'),
    text: field.value,
  };
}, { raw: 'Плъзгач|' + SENTENCE, format: FORMAT, attach });
ok(sliderInsert.rows.length === 3 && sliderInsert.rows.every(r => r.paramint !== undefined),
  `вмъкването става три пъти с различна стойност на плъзгача (${JSON.stringify(sliderInsert.rows)})`, sliderInsert);
ok(sliderInsert.rows[0] && sliderInsert.rows[0].paramint === 3 && sliderInsert.rows[0].shown === '30%',
  `30% -> paramint 3 (${sliderInsert.rows[0] && sliderInsert.rows[0].paramint}, показано ${sliderInsert.rows[0] && sliderInsert.rows[0].shown})`, sliderInsert.rows);
ok(sliderInsert.rows[1] && sliderInsert.rows[1].paramint === 7 && sliderInsert.rows[1].shown === '70%',
  `70% -> paramint 7, не 3 (${sliderInsert.rows[1] && sliderInsert.rows[1].paramint}, показано ${sliderInsert.rows[1] && sliderInsert.rows[1].shown})`, sliderInsert.rows);
ok(sliderInsert.rows[2] && sliderInsert.rows[2].paramint === 10 && sliderInsert.rows[2].shown === '100%',
  `100% -> paramint 10, не 3 (${sliderInsert.rows[2] && sliderInsert.rows[2].paramint}, показано ${sliderInsert.rows[2] && sliderInsert.rows[2].shown})`, sliderInsert.rows);
ok(sliderInsert.images.length === 5,
  `всяко вмъкване слага по едно ново място (${sliderInsert.images.map(i => i.paramint)})`, sliderInsert.images);
ok(sliderInsert.menu === false, 'менюто се затваря след вмъкването');

// ======================= 12. „Обнови" от маркера: прилага и затваря =======================
// Собственикът: „добави Update, което просто го затваря и прилага избрания процент - сега не е ясно
// как да го затворим". За проверката се отваря чиста бележка със своя прозорец: двете ѝ снимки са
// далеч една от друга (иначе съседни маркери се застъпват и щракът улучва съседния).
const openedMarker = await page.evaluate(async ({ raw, format }) => {
  showModal({ raw, format, gdid: 'G_UPDATE', id: 'update-1' });
  const body = document.getElementById('modal-body');
  if (!allNotesData.some(n => String(n.gdid) === 'G_UPDATE')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G_UPDATE', id: 'update-1', notetxt: raw, numord: 903, sellist: 0, status: 0,
      text_span: format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 1,
    });
  }
  enableNoteEditing(body);
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 40));
  // Прозорецът се отваря със смаляване (scale 0.7 -> 1): геометрията се мери само на мащаб 1.
  const scaleDeadline = Date.now() + 8000;
  while (Date.now() < scaleDeadline) {
    const scale = box.getBoundingClientRect().width / (box.offsetWidth || 1);
    if (Math.abs(scale - 1) < 0.01) break;
    await new Promise(r => requestAnimationFrame(r));
  }
  const backdrop = document.getElementById('note-edit-textarea-backdrop');
  const first = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8)[0];
  const mark = backdrop.querySelector(`.nm-inline-mark[data-nm-start="${first.start}"]`);
  mark.scrollIntoView({ block: 'center' });
  await new Promise(r => requestAnimationFrame(r));
  const r = mark.getBoundingClientRect();
  return { start: first.start, paramint: first.paramint, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
}, { raw: 'Обнови|' + SENTENCE, format: FORMAT });
await page.mouse.click(openedMarker.cx, openedMarker.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const markerMenu = await page.evaluate(() => {
  const m = document.querySelector('.nm-inline-menu');
  return {
    kind: m ? m.dataset.nmMenu : null,
    actions: m ? [...m.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction) : null,
    values: m ? [...m.querySelectorAll('[data-nm-menu-value]')].map(v => v.textContent.trim()) : null,
    range: m ? m.querySelector('.nm-inline-menu-range').value : null,
  };
});
ok(markerMenu.kind === 'marker' && markerMenu.actions && markerMenu.actions.join(',') === 'remove,update,cancel',
  `под маркера редовете са „Махни", „Обнови" и „Отказ" (${JSON.stringify(markerMenu)})`, markerMenu);
ok(markerMenu.values && markerMenu.values.join('|') === '40%|40%' && markerMenu.range === '40',
  `менюто отваря с ширината на това място (${markerMenu.values})`, markerMenu);
// Само щрак върху „Обнови" (плъзгачът не е мърдан): менюто се затваря, ширината не се пипа,
// затова и няма ново стъпало за отмяна.
const updateNoChange = await page.evaluate(() => {
  const body = document.getElementById('modal-body');
  const before = body._noteEditUndo ? body._noteEditUndo.entries.length : 0;
  document.querySelector('.nm-inline-menu [data-nm-menu-action="update"]').click();
  const after = body._noteEditUndo ? body._noteEditUndo.entries.length : 0;
  return { before, after, menu: !!document.querySelector('.nm-inline-menu') };
});
ok(updateNoChange.menu === false, '„Обнови" затваря менюто (досега то се затваряше само с щрак извън него)', updateNoChange);
ok(updateNoChange.after === updateNoChange.before,
  `„Обнови" без промяна по плъзгача не вдига стъпало за отмяна (${updateNoChange.before} -> ${updateNoChange.after})`, updateNoChange);
// Плъзгачът на 50%, после „Обнови": ширината е приложена и менюто се затваря.
await page.mouse.click(openedMarker.cx, openedMarker.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const applied = await page.evaluate(async ({ start }) => {
  const body = document.getElementById('modal-body');
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '50';
  // Плъзгането на приложението идва като input, а пускането на плъзгача - като change; change-ът
  // е стъпалото за отмяна (както в раздел 5 на inline-image-menu.mjs).
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  const shown = (document.querySelector('.nm-inline-menu [data-nm-menu-value]') || {}).textContent;
  const before = body._noteEditUndo ? body._noteEditUndo.entries.length : 0;
  document.querySelector('.nm-inline-menu [data-nm-menu-action="update"]').click();
  const after = body._noteEditUndo ? body._noteEditUndo.entries.length : 0;
  await new Promise(r => setTimeout(r, 40));
  const all = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8);
  const fmt = all.find(f => f.start === start);
  return {
    shown,
    paramint: fmt ? fmt.paramint : null,
    menu: !!document.querySelector('.nm-inline-menu'),
    places: all.map(f => ({ start: f.start, paramint: f.paramint })),
    undoBefore: before,
    undoAfter: after,
  };
}, { start: openedMarker.start });
ok(applied.shown === '50%', `плъзгачът показва 50% (${applied.shown})`, applied);
ok(applied.paramint === 5, `„Обнови" прилага избрания процент в записа (paramint ${applied.paramint})`, applied);
ok(applied.menu === false, 'и затваря менюто');
ok(applied.places.length === 2 && applied.places.filter(p => p.start === openedMarker.start)[0].paramint === 5
  && applied.places.filter(p => p.start !== openedMarker.start)[0].paramint === 2,
  `пипа се само това място, другата снимка остава 2 (${JSON.stringify(applied.places)})`, applied);
ok(applied.undoAfter === applied.undoBefore,
  `„Обнови" не вдига второ стъпало: пускането на плъзгача вече го е вдигнало (${applied.undoBefore} -> ${applied.undoAfter})`, applied);

// ======================= 13. Менюто от плочката показва снимката още първия път =======================
// Собственикът: „при клик на икона в лентата се отваря менюто без нищо повече, ако мръднем
// процентите - показва се празна рамка". Затова се проверява файл, който още НЕ е в текста на
// бележката: маркерите не са го питали, значи миниатюрата му е студена - точно случаят от оплакването.
const TILE_NOTE = 'Само текст, в който още няма снимка';
const TILE_ATTACH = [
  { datemod: 1, description: '', gdid: 'MT1', id: 71, path: 'Wallet.jpg', pathGD: 'WALLET_NEW', type: 1 },
  { datemod: 1, description: '', gdid: 'MT2', id: 72, path: 'nova.jpg', pathGD: 'NOVA_NEW', type: 1 },
];
const tileOpened = await page.evaluate(async ({ raw, attach }) => {
  if (!mediaData.some(m => m.noteid === 'G_TILE')) mediaData.push(...attach.map(a => ({ ...a, noteid: 'G_TILE' })));
  showModal({ raw, format: '', gdid: 'G_TILE', id: 'tile-1' });
  const body = document.getElementById('modal-body');
  if (!allNotesData.some(n => String(n.gdid) === 'G_TILE')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G_TILE', id: 'tile-1', notetxt: raw, numord: 904, sellist: 0, status: 0,
      text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, uiState: {}, version: 1,
    });
  }
  enableNoteEditing(body);
  const box = body.closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
  await new Promise(r => setTimeout(() => requestAnimationFrame(r), 40));
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const tiles = [...body.querySelectorAll('.nm-attach-tile:not(.is-add)')];
    if (tiles.length === 2 && tiles.every(t => t.dataset.state === 'ready')) break;
    await new Promise(r => setTimeout(r, 40));
  }
  // Няма нито един запис type=8: снимката е само в лентата.
  const images = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).length;
  const cs = getComputedStyle(body);
  return {
    images,
    tiles: [...body.querySelectorAll('.nm-attach-tile:not(.is-add)')].map(t => t.dataset.nmFileName + ':' + t.dataset.state),
    column: Math.round(body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
  };
}, { raw: TILE_NOTE, attach: TILE_ATTACH });
ok(tileOpened.images === 0 && tileOpened.tiles.length === 2,
  `новата бележка има две снимки в лентата и НИТО една в текста (${tileOpened.tiles.join(', ')})`, tileOpened);

// Прозорецът се отваря със смаляване (scale 0.7 -> 1): плочката се мери само на мащаб 1, иначе
// щракът с мишката пада на мястото, където плочката вече не е.
const tileScale = await waitScale();
await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(r), 120)));
const tileMenuRect = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const box = body.closest('.modal-content-box');
  const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')].find(t => t.dataset.nmFileName === 'nova.jpg');
  // Прозорецът се подрежда надолу с всеки нов (лентата е на дъното му) и може да излезе под екрана:
  // вдига се, както собственикът би го дръпнал - иначе щракът с мишката пада извън видимата част.
  if (tile.getBoundingClientRect().bottom > window.innerHeight - 4) {
    box.style.top = '24px';
  }
  await new Promise(r => requestAnimationFrame(r));
  const r = tile.getBoundingClientRect();
  return {
    cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
    inStrip: !!tile.closest('.nm-attach-strip'), editMode: !!tile.closest('.nm-edit-with-strip'),
    inView: r.top >= 0 && r.bottom <= window.innerHeight,
  };
});
ok(tileScale && tileMenuRect.inStrip && tileMenuRect.editMode && tileMenuRect.inView,
  `плочката е в лентата на редактора и е в картината (x${tileMenuRect.cx}, y${tileMenuRect.cy})`, tileMenuRect);

// Истинско щракване върху плочката на файла, който още не е в текста.
await page.mouse.click(tileMenuRect.cx, tileMenuRect.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const ghost30 = await page.evaluate(async () => {
  const ghostNow = () => document.querySelector('.nm-inline-ghost');
  const menuNow = () => document.querySelector('.nm-inline-menu');
  if (!ghostNow()) return { missing: true, menu: !!menuNow() };
  const deadline = Date.now() + 8000;
  // Адресът на снимката идва по мрежата (или от самата плочка): изчаква се да застане на кадъра.
  while (Date.now() < deadline) {
    if (/thumb\.invalid/.test(getComputedStyle(ghostNow()).backgroundImage)) break;
    await new Promise(r => setTimeout(r, 40));
  }
  // Естествената ширина на снимката също идва по мрежата: щом дойде, кадърът застава в ТОЧНИЯ
  // размер - 30% от 300px = 90px (вж. natural в showNmInlineGhost).
  while (Date.now() < deadline) {
    const g = ghostNow();
    if (g && Math.abs(Math.round(g.getBoundingClientRect().width) - 90) <= 2) break;
    await new Promise(r => setTimeout(r, 40));
  }
  const g = ghostNow();
  const menu = menuNow();
  const r = g.getBoundingClientRect();
  return {
    label: g.textContent.trim(),
    bg: getComputedStyle(g).backgroundImage,
    width: Math.round(r.width),
    height: Math.round(r.height),
    pointerEvents: getComputedStyle(g).pointerEvents,
    kind: menu ? menu.dataset.nmMenu : null,
    range: menu ? menu.querySelector('.nm-inline-menu-range').value : null,
    values: menu ? [...menu.querySelectorAll('[data-nm-menu-value]')].map(v => v.textContent.trim()) : null,
    labels: menu ? [...menu.querySelectorAll('.nm-inline-menu-row')].map(b => b.textContent.trim()) : null,
    actions: menu ? [...menu.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction) : null,
    cancelClass: menu ? (menu.querySelector('[data-nm-menu-action="cancel"]') || {}).className : null,
  };
});
ok(ghost30.kind === 'tile' && ghost30.missing !== true && ghost30.label === '30%',
  `още при отварянето от плочката излиза кадър на избрания процент (${ghost30.label} при меню ${ghost30.kind})`, ghost30);
ok(ghost30.range === '30' && ghost30.values && ghost30.values.join('|') === '30%|30%',
  `файл, който още не е в текста, отваря менюто на стандартните 30% (${ghost30.values})`, ghost30);
ok(/thumb\.invalid/.test(String(ghost30.bg)) && !/linear-gradient/.test(String(ghost30.bg)),
  `кадърът носи САМАТА снимка (адрес от фалшивия Drive), не само рамката по подразбиране (${String(ghost30.bg).slice(0, 70)})`, ghost30);
ok(Math.abs(ghost30.width - 90) <= 2 && Math.abs(ghost30.height - 68) <= 3,
  `кадърът е в ТОЧНИЯ размер: 30% от 300px = 90px (${ghost30.width}x${ghost30.height})`, ghost30);
ok(ghost30.pointerEvents === 'none', `кадърът остава само за окото, не хваща щракове (${ghost30.pointerEvents})`);
ok(ghost30.actions && ghost30.actions[ghost30.actions.length - 1] === 'cancel' && ghost30.labels[ghost30.labels.length - 1] === 'Отказ',
  `последният ред в менюто от плочката е „Отказ" (${ghost30.labels})`, ghost30);
ok(ghost30.cancelClass === 'nm-inline-menu-row is-cancel',
  `редът „Отказ" е с неутралния клас, не с червения на „Махни" (${ghost30.cancelClass})`, ghost30);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-4-tile-ghost.png` });

// Плъзгането мести СЪЩАТА тази снимка: 60% от 300px = 180px.
const ghost60 = await page.evaluate(async () => {
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '60';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const g = document.querySelector('.nm-inline-ghost');
  const r = g.getBoundingClientRect();
  const menu = document.querySelector('.nm-inline-menu');
  return {
    label: g.textContent.trim(),
    bg: getComputedStyle(g).backgroundImage,
    width: Math.round(r.width),
    widthNow: menu.querySelector('.nm-inline-menu-range').value,
    values: [...menu.querySelectorAll('[data-nm-menu-value]')].map(v => v.textContent.trim()),
  };
});
ok(ghost60.label === '60%' && ghost60.values.join('|') === '60%|60%',
  `докато плъзгачът се мести, числото се сменя (${ghost60.values})`, ghost60);
ok(ghost60.width > ghost30.width && Math.abs(ghost60.width - 180) <= 3,
  `същата снимка се уголемява на живо: 60% от 300px = 180px (${ghost30.width}px -> ${ghost60.width}px)`, { ghost30, ghost60 });
ok(/thumb\.invalid/.test(String(ghost60.bg)),
  `снимката остава на кадъра и след плъзгането (${String(ghost60.bg).slice(0, 70)})`, ghost60);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-5-tile-ghost-60.png` });

// ======================= 14. „Отказ" връща ширината и в двете менюта =======================
// Първо снимката влиза в текста при 30%, за да има какво да върне „Отказ".
const tileInserted = await page.evaluate(async () => {
  const body = document.getElementById('modal-body');
  const field = document.getElementById('note-edit-textarea');
  const pos = field.value.length;
  field.focus();
  field.setSelectionRange(pos, pos);
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '30';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('.nm-inline-menu [data-nm-menu-action="insert"]').click();
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const hit = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).find(f => f.type === 8 && f.start === pos);
    if (hit) return { pos, paramint: hit.paramint, format: body.dataset.format, menu: !!document.querySelector('.nm-inline-menu') };
    await new Promise(r => setTimeout(r, 40));
  }
  return { pos, missing: true, format: body.dataset.format };
});
ok(tileInserted.paramint === 3 && tileInserted.menu === false,
  `снимката влезе в текста при 30% (paramint ${tileInserted.paramint}) и менюто се затвори`, tileInserted);

// От плочката: плъзгачът на 70, после „Отказ" - записът трябва да е точно същият низ като преди.
const tileCancel = await page.evaluate(async ({ pos }) => {
  const body = document.getElementById('modal-body');
  const before = body.dataset.format;
  const tile = [...document.querySelectorAll('#modal-body .nm-attach-tile:not(.is-add)')].find(t => t.dataset.nmFileName === 'nova.jpg');
  tile.click();
  const pcts = () => (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint);
  const onOpen = pcts();
  const range = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  range.value = '70';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  const moved = pcts();
  const cancelBtn = document.querySelector('.nm-inline-menu [data-nm-menu-action="cancel"]');
  const hadButton = !!cancelBtn;
  cancelBtn.click();
  await new Promise(r => setTimeout(r, 60));
  return {
    before, hadButton, onOpen, moved, after: body.dataset.format,
    afterPcts: pcts(),
    menu: !!document.querySelector('.nm-inline-menu'),
    ghost: !!document.querySelector('.nm-inline-ghost'),
    text: document.getElementById('note-edit-textarea').value,
    start: pos,
  };
}, { pos: tileInserted.pos });
ok(tileCancel.hadButton, 'в менюто от плочката има ред „Отказ"');
ok(tileCancel.onOpen.join(',') === '3' && tileCancel.moved.join(',') === '7',
  `плъзгането до 70% пише paramint 7 (${tileCancel.moved})`, tileCancel);
ok(tileCancel.after === tileCancel.before,
  `„Отказ" връща записа БАЙТ ПО БАЙТ какъвто беше (paramint 3, нищо друго не се пипа)`, tileCancel);
ok(tileCancel.menu === false && tileCancel.ghost === false,
  `„Отказ" затваря менюто и маха кадъра (меню ${tileCancel.menu}, кадър ${tileCancel.ghost})`, tileCancel);

// От маркера в текста: същото, но се пипа само това място.
const markerCancel = await page.evaluate(async ({ pos }) => {
  const body = document.getElementById('modal-body');
  const backdrop = document.getElementById('note-edit-textarea-backdrop');
  const mark = backdrop.querySelector(`.nm-inline-mark[data-nm-start="${pos}"]`);
  mark.scrollIntoView({ block: 'center' });
  await new Promise(r => requestAnimationFrame(r));
  const r = mark.getBoundingClientRect();
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), width: Math.round(r.width), left: Math.round(r.left), before: body.dataset.format };
}, { pos: tileInserted.pos });
await page.mouse.click(markerCancel.cx, markerCancel.cy);
await page.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout: 3000 }).catch(() => { });
const markerCanceled = await page.evaluate(async ({ pos, before, rectWidth, rectLeft }) => {
  const body = document.getElementById('modal-body');
  const menu = document.querySelector('.nm-inline-menu');
  const labels = menu ? [...menu.querySelectorAll('.nm-inline-menu-row')].map(b => b.textContent.trim()) : null;
  const actions = menu ? [...menu.querySelectorAll('[data-nm-menu-action]')].map(b => b.dataset.nmMenuAction) : null;
  const range = menu.querySelector('.nm-inline-menu-range');
  range.value = '70';
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
  const moved = (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint);
  document.querySelector('.nm-inline-menu [data-nm-menu-action="cancel"]').click();
  await new Promise(r => setTimeout(r, 60));
  const mark = document.getElementById('note-edit-textarea-backdrop').querySelector(`.nm-inline-mark[data-nm-start="${pos}"]`);
  const r = mark.getBoundingClientRect();
  return {
    labels, actions, moved,
    after: body.dataset.format,
    afterPcts: (body.dataset.format || '').split('|').filter(Boolean).map(x => JSON.parse(x)).filter(f => f.type === 8).map(f => f.paramint),
    menu: !!document.querySelector('.nm-inline-menu'),
    markWidth: Math.round(r.width),
    markLeft: Math.round(r.left),
    before, rectWidth, rectLeft,
  };
}, { pos: tileInserted.pos, before: markerCancel.before, rectWidth: markerCancel.width, rectLeft: markerCancel.left });
ok(markerCanceled.labels && markerCanceled.labels[markerCanceled.labels.length - 1] === 'Отказ',
  `и в менюто от маркера последният ред е „Отказ" (${markerCanceled.labels})`, markerCanceled.actions);
ok(markerCanceled.moved.join(',') === '7', `плъзгането от маркера пише paramint 7 (${markerCanceled.moved})`, markerCanceled);
ok(markerCanceled.after === markerCanceled.before && markerCanceled.afterPcts.join(',') === '3',
  `„Отказ" връща paramint 3 и не пипа друго в записа (${markerCanceled.afterPcts})`, markerCanceled);
ok(markerCanceled.menu === false, 'и там менюто се затваря');
ok(Math.abs(markerCanceled.markWidth - markerCanceled.rectWidth) <= 1 && Math.abs(markerCanceled.markLeft - markerCanceled.rectLeft) <= 1,
  `маркерът в текста не мърда: същата ширина и същото място (${markerCanceled.rectWidth}x${markerCanceled.rectLeft} -> ${markerCanceled.markWidth}x${markerCanceled.markLeft})`, markerCanceled);
if (SHOTS) await page.screenshot({ path: `${SHOTS}-6-after-cancel.png` });

// ======================= 15. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('Drive заявки: ' + JSON.stringify(DRIVE.list.slice(0, 12)));
  console.log('thumbnail заявки: ' + JSON.stringify(DRIVE.thumb.slice(0, 12)));
}
await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
