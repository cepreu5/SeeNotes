// Плаващ кадър в РЕАЛЕН размер при посочване (или докосване) на снимка в текста - режим Редактиране.
// Собственикът (24.10.2026): „Направи така, че като посоча или докосна снимката в текста в режим
// редактиране, да виждам плаващ кадър с реалния размер на избрания процент, без да се разваля
// подредбата на текста."
// В редактора маркерът на снимката е широк един знак (иначе каретата в прозрачната текстова кутия
// бяга от нарисувания текст - виж renderNoteEditBackdrop), затова кадърът е отделен слой върху
// документа. Тук се проверява по ИСТИНСКИЯ път в браузър (showModal + enableNoteEditing + истински
// показалец), не по пресметнато правило:
//   - посочване на маркер -> кадърът излиза, широк е избрания процент от базата и е с пропорцията
//     на снимката, с етикет с процента;
//   - снимка на 100% от висока 300x600 -> кадърът НЕ е отрязан на 200 px (таванът на кадъра от
//     менюто), а е цялата снимка (или цялата смалена по пропорция, ако не се побира на екрана);
//   - текстът в полето и форматите остават БАЙТ ПО БАЙТ същите, маркерите и подложката не мърдат -
//     кадърът не пипа подредбата;
//   - отместване на показалеца -> кадърът изчезва;
//   - тъч (pointerdown с pointerType 'touch') върху маркера -> кадърът излиза веднага.
// Пуска се от корена на хранилището (cx-notes):
//   node .bolter/check/inline-image-hover-ghost.mjs      (exit 1 при провалена проверка)
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
const WIDE = 'file_0000.png';
const WIDE_ID = 'FILE0000';
const TALL = 'file_0001.png';
const TALL_ID = 'FILE0001';
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const DATA_FOLDER = 'FOLDER_MULTINOTES_DATA';
const FILES = {
  [WIDE_ID]: { name: WIDE, w: 300, h: 225 },
  [TALL_ID]: { name: TALL, w: 300, h: 600 },
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
// hasTouch: тъч-проверката минава по истинския път на браузъра (pointerdown с pointerType 'touch'),
// а не със синтетично събитие от страницата.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', hasTouch: true });
// Фалшивият Drive се вдига за всяка страница (и за тясната): една функция за всички контексти.
const routeExternal = async (route) => {
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
    // Истинският размер на снимката: по него се смята пропорцията на кадъра.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}"><rect width="${f.w}" height="${f.h}" fill="#c6d2e4"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  }
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
};
await ctx.route(/^https?:\/\/(?!localhost)/, routeExternal);
const seedScript = () => {
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
};
await ctx.addInitScript(seedScript);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 });

// --- Бележка с две снимки в текста: широката на 30% (paramint 3), високата на 100% (paramint 10) ---
const RAW = 'Бележка|Първи ред със снимка * и още думи\nВтори ред с висока * на края';
const STAR1 = RAW.indexOf('*');
const STAR2 = RAW.indexOf('*', STAR1 + 1);
const pathOf = (f) => '/storage/emulated/0/Pictures/Images/' + f;
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const FORMAT = fmt(
  { start: STAR1, end: STAR1 + 1, type: 8, paramstring: pathOf(WIDE), paramint: 3 },
  { start: STAR2, end: STAR2 + 1, type: 8, paramstring: pathOf(TALL), paramint: 10 },
);

// --- Отваряне на бележката и влизане в редакция (истинският път: showModal + enableNoteEditing) ---
await page.evaluate(async ({ raw, format }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  mediaData.length = 0;
  // Базата на ширината (uiState.imgbase) е записана: 30% значи точно 30% от 300 = 90px.
  if (!allNotesData.some(n => String(n.gdid) === 'G1')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G1', id: '901', notetxt: raw, numord: 901, sellist: 0, status: 0, text_span: format,
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
      uiState: { imgbase: { 'file_0000.png': 300, 'file_0001.png': 300 } },
    });
  }
  showModal({ raw, format, gdid: 'G1', id: '901' });
  enableNoteEditing(document.getElementById('modal-body'));
  // Реален размер на прозореца на бележката: без него тялото е високо колкото съдържанието си и
  // маркерите излизат извън видимата част.
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  box.style.height = '660px';
  box.style.maxHeight = '660px';
}, { raw: RAW, format: FORMAT });

// Маркерите се рисуват, след като миниатюрите им дойдат от Drive.
const ready = await page.waitForFunction(() => {
  const marks = [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-file]')];
  if (marks.length < 2) return false;
  return marks.every(m => m.dataset.nmMarkState && m.dataset.nmMarkState !== 'loading') ? marks.length : false;
}, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => 0);
ok(ready === 2, `двете снимки имат готови маркери в редактора (${ready})`);

// Геометрията се мери само след като преходът на прозореца е свършил (иначе е смалена и маркерите
// мърдат с части от пиксела между две четения).
await page.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  if (!body || !body.offsetWidth) return false;
  const scale = body.getBoundingClientRect().width / body.offsetWidth;
  if (Math.abs(scale - 1) > 0.005) return false;
  const now = [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark')]
    .map(m => { const r = m.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).join('|');
  const prev = window.__hoverGeomPrev;
  window.__hoverGeomPrev = now;
  return prev !== undefined && prev === now;
}, null, { timeout: 15000 }).catch(() => { });

const marks = await page.evaluate(() => [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-file]')].map(m => {
  const r = m.getBoundingClientRect();
  return { file: m.dataset.nmFile, start: Number(m.dataset.nmStart), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
}));
const ordered = marks.slice().sort((a, b) => a.start - b.start);
const wideMark = ordered[0];
const tallMark = ordered[1];
ok(!!wideMark && !!tallMark && wideMark.file === 'file_0000.png' && tallMark.file === 'file_0001.png',
  `маркерите са на двете снимки (${JSON.stringify(marks.map(m => m.file))})`);
ok(!!wideMark && !!tallMark && wideMark.cy > 0 && tallMark.cy > 0, 'маркерите са във видимата част на екрана', marks);

// Снимка на състоянието: текст, формати, маркери, подложка. След кадъра трябва да е БАЙТ ПО БАЙТ същото.
const snap = () => page.evaluate(() => {
  const field = document.getElementById('note-edit-textarea');
  const backdrop = document.getElementById('note-edit-textarea-backdrop');
  return {
    value: field.value,
    format: document.getElementById('modal-body').dataset.format || '',
    marks: [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark')].map(m => {
      const r = m.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
    }).join(' | '),
    backdropH: backdrop.scrollHeight,
    caret: [field.selectionStart, field.selectionEnd],
  };
});
const before = await snap();

// Кадърът на екрана (или null).
const readGhost = () => page.evaluate(() => {
  const g = document.querySelector('.nm-inline-ghost');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  const cs = getComputedStyle(g);
  const column = document.getElementById('modal-body').getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    top: Math.round(r.top), left: Math.round(r.left),
    bottom: Math.round(r.bottom), right: Math.round(r.right),
    label: g.textContent.trim(),
    full: g.classList.contains('is-full'),
    pointerEvents: cs.pointerEvents,
    position: cs.position,
    columnW: Math.round(column.width),
    vw: window.innerWidth, vh: window.innerHeight,
  };
});
const waitGhost = (timeout = 4000) => page.waitForFunction(() => {
  const g = document.querySelector('.nm-inline-ghost');
  if (!g) return false;
  const r = g.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}, null, { timeout }).then(() => true).catch(() => false);
const waitNoGhost = (timeout = 3000) => page.waitForFunction(() => !document.querySelector('.nm-inline-ghost'), null, { timeout })
  .then(() => true).catch(() => false);

// =============== 1. Посочване на снимката на 30% ===============
await page.mouse.move(wideMark.cx, wideMark.cy);
const appeared = await waitGhost();
const g30 = await readGhost();
ok(appeared && !!g30, 'посочване на маркера: кадърът излиза', g30);
ok(!!g30 && g30.full, 'кадърът е кадърът от посочване, не този от менюто (.nm-inline-ghost.is-full)', g30);
ok(!!g30 && g30.position === 'fixed' && g30.pointerEvents === 'none',
  'кадърът е отделен слой: position: fixed и pointer-events: none (не хваща кликове)', g30);
ok(!!g30 && g30.label === '30%', `кадърът носи етикет с процента (${g30 && g30.label})`, g30);
// Ширината е избраният процент от базата (300px -> 30% = 90px), но не повече от колоната на бележката.
const wantW30 = Math.min(90, (g30 && g30.columnW) || 0);
ok(!!g30 && Math.abs(g30.w - wantW30) <= 4,
  `ширината е 30% от базата (кадър ${g30 && g30.w}px, очаквано ~${wantW30}px)`, g30);
// Пропорцията е на самата снимка: 300x225 -> височина = ширина x 0.75.
ok(!!g30 && Math.abs(g30.h - g30.w * 0.75) <= 3,
  `височината е по пропорцията на широката снимка (кадър ${g30 && g30.w}x${g30 && g30.h})`, g30);

// =============== 2. Текстът и подредбата не са мръднали ===============
{
  const after = await snap();
  ok(after.value === before.value, 'текстът в полето е БАЙТ ПО БАЙТ същият (textarea.value)', { before: before.value, after: after.value });
  ok(after.format === before.format, 'форматите (dataset.format) са БАЙТ ПО БАЙТ същите', { before: before.format, after: after.format });
  ok(after.marks === before.marks, 'маркерите в подложката стоят точно на същите места (подредбата на текста)', { before: before.marks, after: after.marks });
  ok(after.backdropH === before.backdropH, `подложката не е станала по-висока (${before.backdropH} -> ${after.backdropH})`, { before: before.backdropH, after: after.backdropH });
  ok(JSON.stringify(after.caret) === JSON.stringify(before.caret), 'каретата не е мръднала', { before: before.caret, after: after.caret });
}

// =============== 3. Отместване на показалеца -> кадърът изчезва ===============
await page.mouse.move(4, 4);
const gone = await waitNoGhost();
ok(gone, 'отместване на показалеца от маркера: кадърът изчезва');

// =============== 4. Снимка на 100% от високата 300x600: не е отрязана на 200px ===============
await page.mouse.move(tallMark.cx, tallMark.cy);
const appearedTall = await waitGhost();
const g100 = await readGhost();
ok(appearedTall && !!g100, 'посочване на високата снимка: кадърът излиза', g100);
ok(!!g100 && g100.label === '100%', `етикетът на високата снимка е 100% (${g100 && g100.label})`, g100);
ok(!!g100 && g100.h > 204,
  `кадърът НЕ е отрязан на 200px (височина ${g100 && g100.h}px за 100% от 300x600)`, g100);
ok(!!g100 && Math.abs(g100.h - g100.w * 2) <= 5,
  `височината е по пропорцията на високата снимка (кадър ${g100 && g100.w}x${g100 && g100.h})`, g100);
ok(!!g100 && g100.top >= 0 && g100.left >= 0 && g100.bottom <= g100.vh && g100.right <= g100.vw,
  `кадърът се вижда целият на екрана (${g100 && g100.w}x${g100 && g100.h} при ${g100 && g100.vw}x${g100 && g100.vh})`, g100);
{
  const afterTall = await snap();
  ok(afterTall.value === before.value && afterTall.format === before.format && afterTall.marks === before.marks,
    'и след високия кадър текстът, форматите и маркерите са същите', { afterTall });
}
// Снимка за око (по избор): SHOTS=/път/до/файл.png node .bolter/check/inline-image-hover-ghost.mjs
if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS });

// =============== 5. Докосване: кадърът излиза веднага при pointerdown ===============
await page.mouse.move(4, 4);
await waitNoGhost();
// Без задържане: тъчът няма „посочване", затова кадърът трябва да е на екрана още при натискането.
// Води се дневник на събитията по пътя на докосването - той показва и в кой момент кадърът е на екрана.
await page.evaluate(() => {
  window.__hoverTouchLog = [];
  window.__hoverGhostAtDown = false;
  const field = document.getElementById('note-edit-textarea');
  const log = (name, event) => {
    const ghost = !!document.querySelector('.nm-inline-ghost');
    window.__hoverTouchLog.push(name + '/' + (event.pointerType || '') + ' ghost=' + (ghost ? 1 : 0));
    if (name === 'pointerdown') window.__hoverGhostAtDown = ghost;
    // Кадърът от докосването се помни по размер - после се сравнява с кадъра на отвореното меню.
    if (name === 'pointerdown') {
      const g = document.querySelector('.nm-inline-ghost');
      const r = g ? g.getBoundingClientRect() : null;
      window.__hoverGhostDownRect = r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    }
  };
  // Слушателите тук са във фаза „изплуване" и са добавени СЛЕД тези на редактора: за един и същ
  // елемент те се викат в реда на добавяне, значи дневникът вижда какво е станало в самия pointerdown.
  ['pointerdown', 'pointerup', 'click', 'pointerleave', 'pointercancel', 'scroll', 'input'].forEach(t =>
    field.addEventListener(t, (event) => log(t, event)));
});
await page.touchscreen.tap(wideMark.cx, wideMark.cy);
const touchLog = await page.evaluate(() => window.__hoverTouchLog);
const ghostAtDown = await page.evaluate(() => window.__hoverGhostAtDown === true);
ok(ghostAtDown, 'тъч върху маркера: кадърът е на екрана още при pointerdown (без мърдане на плъзгача)', touchLog);
const gTouch = await readGhost();
ok(!!gTouch && gTouch.w > 0 && gTouch.label === '30%',
  `тъч кадърът е на реалния размер (${gTouch && gTouch.w}x${gTouch && gTouch.h}, етикет ${gTouch && gTouch.label})`, gTouch);

// =============== 6. Менюто е отворено: кадърът СТОИ, в реален размер и извън менюто ===============
// Собственикът (24.10.2026, на телефон): „При докосване на мини изображението се появява за кратко
// снимката и излиза менюто, но снимката се скрива - направи я да стои постоянно докато не се затвори
// менюто." Затова тук се гледа какво е на екрана СЛЕД като менюто вече е излязло.
const readState = (p) => p.evaluate(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const g = document.querySelector('.nm-inline-ghost');
  const m = document.querySelector('.nm-inline-menu');
  const column = document.getElementById('modal-body');
  const gEl = g ? rect(g) : null;
  const mEl = m ? rect(m) : null;
  // Застъпват се, когато правоъгълниците имат обща точка: кадърът не бива да ляга върху менюто.
  const cross = !!gEl && !!mEl && !(gEl.right <= mEl.left || gEl.left >= mEl.right || gEl.bottom <= mEl.top || gEl.top >= mEl.bottom);
  const cs = g ? getComputedStyle(g) : null;
  return {
    ghost: gEl, menu: mEl, menuKind: m ? m.dataset.nmMenu : '', cross,
    label: g ? g.textContent.trim() : '',
    full: g ? g.classList.contains('is-full') : false,
    pointerEvents: cs ? cs.pointerEvents : '',
    position: cs ? cs.position : '',
    inside: gEl ? (gEl.top >= 0 && gEl.left >= 0 && gEl.bottom <= window.innerHeight && gEl.right <= window.innerWidth) : false,
    columnW: column ? Math.round(column.getBoundingClientRect().width) : 0,
    vw: window.innerWidth, vh: window.innerHeight,
  };
});
const waitMenu = (p, timeout = 4000) => p.waitForFunction(() => !!document.querySelector('.nm-inline-menu'), null, { timeout })
  .then(() => true).catch(() => false);
const waitBothGone = (p, timeout = 3000) => p.waitForFunction(() => !document.querySelector('.nm-inline-ghost') && !document.querySelector('.nm-inline-menu'), null, { timeout })
  .then(() => true).catch(() => false);
const pressEscape = (p) => p.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

// Тъчът вече отвори менюто (щракването стига до маркера) - тук се мери какво остава на екрана.
const downRect = await page.evaluate(() => window.__hoverGhostDownRect);
const menuUp = await waitMenu(page);
const s1 = await readState(page);
ok(menuUp && !!s1.menu && s1.menuKind === 'marker', 'след докосването менюто от маркера е отворено', s1);
ok(!!s1.ghost && s1.full, 'с отворено меню кадърът е още на екрана и е в реалния размер (.nm-inline-ghost.is-full)', s1);
ok(!!s1.ghost && !!downRect && Math.abs(s1.ghost.w - downRect.w) <= 3,
  `кадърът е със същата ширина като при докосването (${s1.ghost && s1.ghost.w} при ${downRect && downRect.w})`, { s1, downRect });
ok(!!s1.ghost && s1.label === '30%', `етикетът на кадъра е избраният процент (${s1.label})`, s1);
ok(!!s1.ghost && !s1.cross, 'кадърът и менюто не се застъпват', s1);
ok(!!s1.ghost && s1.inside,
  `кадърът се вижда целият на екрана (${s1.ghost && s1.ghost.w}x${s1.ghost && s1.ghost.h} при ${s1.vw}x${s1.vh})`, s1);
ok(!!s1.ghost && s1.position === 'fixed' && s1.pointerEvents === 'none',
  'кадърът не хваща докосването (pointer-events: none) - редовете на менюто се стигат', s1);

// =============== 7. Плъзгачът: кадърът сменя размера и НЕ изчезва при отпускане ===============
await page.evaluate(() => {
  const r = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  r.value = '60';
  r.dispatchEvent(new Event('input', { bubbles: true }));
});
const sDrag = await readState(page);
ok(!!sDrag.ghost && sDrag.label === '60%' && Math.abs(sDrag.ghost.w - 180) <= 4,
  `докато плъзгачът се мести, кадърът е в новия размер (${sDrag.ghost && sDrag.ghost.w}px, етикет ${sDrag.label}, очаквано ~180px)`, sDrag);
await page.evaluate(() => {
  const r = document.querySelector('.nm-inline-menu .nm-inline-menu-range');
  r.dispatchEvent(new Event('change', { bubbles: true }));
});
const sDrop = await readState(page);
ok(!!sDrop.ghost && !!sDrop.menu && sDrop.label === '60%',
  'след отпускане на плъзгача кадърът остава на екрана (при плочката се маха, тук - не)', sDrop);

// =============== 8. Затваряне по всички пътища: кадърът изчезва заедно с менюто ===============
await pressEscape(page);
const closedByEsc = await waitBothGone(page);
ok(closedByEsc, 'Escape: няма нито кадър, нито меню');

// Менюто се отваря пак с тъч; тап върху „Обнови" минава ПРЕЗ кадра (той е pointer-events: none) и
// кадърът изчезва заедно с менюто.
await page.touchscreen.tap(wideMark.cx, wideMark.cy);
const menuAgain = await waitMenu(page);
const s2 = await readState(page);
const updateRow = await page.evaluate(() => {
  const row = document.querySelector('.nm-inline-menu [data-nm-menu-action="update"]');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
ok(menuAgain && !!s2.ghost && !!updateRow,
  `второ докосване: менюто пак е отворено, кадърът е на екрана, редът „Обнови" е на линия (${updateRow && updateRow.x + ',' + updateRow.y})`, { s2, updateRow });
let afterUpdate = false;
if (updateRow) {
  await page.touchscreen.tap(updateRow.x, updateRow.y);
  afterUpdate = await waitBothGone(page);
}
ok(afterUpdate, 'тап върху „Обнови" стига до менюто през кадра: кадърът и менюто изчезват');

ok(errs.length === 0, 'няма грешки в конзолата', errs.slice(0, 3));

// =============== 9. Тясна страница (390x844, истински тъч): същото, но кадърът се смалява ===============
// Собственикът уточни, че оплакването е от ТЕЛЕФОН, затова същото се проверява и при ширина на екрана
// 390 px: кадърът в реален размер там не се побира над маркера и се смалява по пропорция - но пак
// стои, докато менюто е отворено, и пак не закрива менюто.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
await mobile.route(/^https?:\/\/(?!localhost)/, routeExternal);
await mobile.addInitScript(seedScript);
const mpage = await mobile.newPage();
const merrs = [];
mpage.on('pageerror', e => merrs.push(String(e.message).slice(0, 300)));
mpage.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) merrs.push(String(m.text()).slice(0, 300)); });
await mpage.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await mpage.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
await mpage.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await mpage.waitForFunction(() => contentModal, null, { timeout: 20000 });
await mpage.evaluate(async ({ raw, format, boxH }) => {
  useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
  dbSourceGlobal = null; dirHandle = null; isOffline = false;
  authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
  mediaData.length = 0;
  if (!allNotesData.some(n => String(n.gdid) === 'G1')) {
    allNotesData.push({
      alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
      gdid: 'G1', id: '901', notetxt: raw, numord: 901, sellist: 0, status: 0, text_span: format,
      title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
      uiState: { imgbase: { 'file_0000.png': 300, 'file_0001.png': 300 } },
    });
  }
  showModal({ raw, format, gdid: 'G1', id: '901' });
  enableNoteEditing(document.getElementById('modal-body'));
  const box = document.getElementById('modal-body').closest('.modal-content-box');
  box.style.height = boxH + 'px';
  box.style.maxHeight = boxH + 'px';
}, { raw: RAW, format: FORMAT, boxH: 600 });
const mready = await mpage.waitForFunction(() => {
  const list = [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-file]')];
  if (list.length < 2) return false;
  return list.every(m => m.dataset.nmMarkState && m.dataset.nmMarkState !== 'loading') ? list.length : false;
}, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => 0);
ok(mready === 2, `тясна страница: двете снимки имат готови маркери (${mready})`);
await mpage.waitForFunction(() => {
  const body = document.getElementById('modal-body');
  if (!body || !body.offsetWidth) return false;
  if (Math.abs(body.getBoundingClientRect().width / body.offsetWidth - 1) > 0.005) return false;
  const now = [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark')]
    .map(m => { const r = m.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).join('|');
  const prev = window.__mobileGeomPrev;
  window.__mobileGeomPrev = now;
  return prev !== undefined && prev === now;
}, null, { timeout: 15000 }).catch(() => { });
const mmarks = (await mpage.evaluate(() => [...document.querySelectorAll('#note-edit-textarea-backdrop .nm-inline-mark[data-nm-file]')].map(m => {
  const r = m.getBoundingClientRect();
  return { file: m.dataset.nmFile, start: Number(m.dataset.nmStart), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
}))).sort((a, b) => a.start - b.start);
const mWide = mmarks.find(m => m.file === 'file_0000.png');
const mTall = mmarks.find(m => m.file === 'file_0001.png');
ok(!!mWide && !!mTall, `тясна страница: маркерите са на двете снимки (${JSON.stringify(mmarks.map(m => m.file))})`, mmarks);

// (а) широката на 30% (90px): кадърът е в реалния размер, менюто е под него
await mpage.touchscreen.tap(mWide.cx, mWide.cy);
const mMenu1 = await waitMenu(mpage);
const ms1 = await readState(mpage);
ok(mMenu1 && !!ms1.menu && ms1.menuKind === 'marker' && !!ms1.ghost,
  'тясна страница: след тъча менюто е отворено, а кадърът е още на екрана', ms1);
ok(!!ms1.ghost && ms1.full && ms1.label === '30%',
  `тясна страница: кадърът е в реалния размер за 30% (${ms1.ghost && ms1.ghost.w}x${ms1.ghost && ms1.ghost.h}, етикет ${ms1.label})`, ms1);
ok(!!ms1.ghost && !ms1.cross, 'тясна страница: кадърът и менюто не се застъпват', ms1);
ok(!!ms1.ghost && ms1.inside, `тясна страница: кадърът се вижда целият (${ms1.ghost && ms1.ghost.w}x${ms1.ghost && ms1.ghost.h} при ${ms1.vw}x${ms1.vh})`, ms1);

// (б) високата на 100%: реалният размер (300x600) не се побира до менюто на 390px, значи кадърът се
// смалява по пропорция - и пак не закрива менюто.
await pressEscape(mpage);
await waitBothGone(mpage);
await mpage.touchscreen.tap(mTall.cx, mTall.cy);
const mMenu2 = await waitMenu(mpage);
// Първият кадър се строи, докато пропорцията на снимката още не е известна (по колоната), а щом
// естествената ширина дойде, се строи наново - точно това се изчаква тук.
await mpage.waitForFunction(() => {
  const g = document.querySelector('.nm-inline-ghost');
  if (!g) return false;
  const r = g.getBoundingClientRect();
  return r.width > 0 && Math.abs(r.height - r.width * 2) <= 6;
}, null, { timeout: 5000 }).catch(() => { });
const ms2 = await readState(mpage);
ok(mMenu2 && !!ms2.ghost && ms2.full,
  `тясна страница: високата снимка също оставя кадър при отворено меню (${ms2.ghost && ms2.ghost.w}x${ms2.ghost && ms2.ghost.h})`, ms2);
ok(!!ms2.ghost && !ms2.cross, 'тясна страница: кадърът на високата снимка не закрива менюто', ms2);
ok(!!ms2.ghost && ms2.inside, `тясна страница: кадърът на високата снимка се вижда целият (${ms2.ghost && ms2.ghost.w}x${ms2.ghost && ms2.ghost.h} при ${ms2.vw}x${ms2.vh})`, ms2);
ok(!!ms2.ghost && Math.abs(ms2.ghost.h - ms2.ghost.w * 2) <= 6,
  `тясна страница: пропорцията на снимката е запазена при смаляването (${ms2.ghost && ms2.ghost.w}x${ms2.ghost && ms2.ghost.h})`, ms2);
ok(!!ms2.ghost && ms2.ghost.h < 600,
  `тясна страница: кадърът е смален, за да се побира (височина ${ms2.ghost && ms2.ghost.h} при 600 в реален размер)`, ms2);
// Снимка за око на тесния екран (по избор): SHOTS=/път/до/файл.png -> ...-narrow.png
if (process.env.SHOTS) await mpage.screenshot({ path: String(process.env.SHOTS).replace(/\.png$/, '') + '-narrow.png' });
await pressEscape(mpage);
const mClosed = await waitBothGone(mpage);
ok(mClosed, 'тясна страница: Escape маха и кадъра, и менюто');
ok(merrs.length === 0, 'тясна страница: няма грешки в конзолата', merrs.slice(0, 3));
await mobile.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILED');

await browser.close();
srv.close();
process.exit(fails === 0 ? 0 : 1);
